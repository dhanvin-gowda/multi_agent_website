import { createServer } from "node:http";
import next from "next";
import { MongoClient, ObjectId } from "mongodb";
import jwt from "jsonwebtoken";
import { WebSocketServer } from "ws";

const port = Number(process.env.PORT || 3000);
const dev = !process.argv.includes("--production") && process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();
let handleUpgrade;
let mongoClient;
let database;

function getDatabase() { if (!database) database = mongoClient.db("workspace_chat"); return database; }
async function ensureDatabase() { mongoClient = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 }); await mongoClient.connect(); await getDatabase().collection("users").createIndex({ email: 1 }, { unique: true }); }
function profile(user) { return { id: user._id.toString(), name: user.name, email: user.email, initials: user.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase(), color: "orange" }; }
function signUser(user) { if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is missing"); return jwt.sign({ sub: user._id.toString(), email: user.email }, process.env.JWT_SECRET, { expiresIn: "30d" }); }
function readBody(request) { return new Promise((resolve, reject) => { let body = ""; request.on("data", (chunk) => { body += chunk; }); request.on("end", () => { try { resolve(JSON.parse(body || "{}")); } catch { reject(new Error("Invalid JSON")); } }); request.on("error", reject); }); }
function sendJson(response, status, payload) { response.writeHead(status, { "Content-Type": "application/json" }); response.end(JSON.stringify(payload)); }
function bearerToken(request) { const header = request.headers.authorization || ""; return header.startsWith("Bearer ") ? header.slice(7) : ""; }
async function userFromToken(token) { if (!token || !process.env.JWT_SECRET) return null; try { const claims = jwt.verify(token, process.env.JWT_SECRET); if (typeof claims === "string" || !claims.sub) return null; const user = await getDatabase().collection("users").findOne({ _id: new ObjectId(claims.sub) }); return user ? profile(user) : null; } catch { return null; } }

await app.prepare();
handleUpgrade = app.getUpgradeHandler();
try { await ensureDatabase(); } catch (error) { console.error("MongoDB connection failed. Check MONGODB_URI and the Atlas network allowlist.", error instanceof Error ? error.message : error); process.exit(1); }
const httpServer = createServer(async (request, response) => {
	try {
		const url = new URL(request.url || "/", `http://${request.headers.host}`);
		if (url.pathname === "/api/auth/signup" && request.method === "POST") {
			const body = await readBody(request); const cleanName = String(body.name || "").trim(); const cleanEmail = String(body.email || "").trim().toLowerCase();
			if (cleanName.length < 2 || cleanName.length > 80) return sendJson(response, 400, { error: "Enter a name between 2 and 80 characters." });
			if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return sendJson(response, 400, { error: "Enter a valid email address." });
			const users = getDatabase().collection("users"); const now = new Date();
			const result = await users.findOneAndUpdate({ email: cleanEmail }, { $set: { name: cleanName, email: cleanEmail, updatedAt: now }, $setOnInsert: { createdAt: now } }, { upsert: true, returnDocument: "after" });
			const user = result.value || result; return sendJson(response, 200, { token: signUser(user), user: profile(user) });
		}
		if (url.pathname === "/api/auth/me" && request.method === "GET") { const user = await userFromToken(bearerToken(request)); return user ? sendJson(response, 200, { user }) : sendJson(response, 401, { error: "Session expired." }); }
		return handle(request, response);
	} catch (error) { console.error(error); sendJson(response, 500, { error: "The server could not process that request." }); }
});

const socketServer = new WebSocketServer({ noServer: true });
const clients = new Set();
socketServer.on("connection", (socket, user) => {
	clients.add(socket);
	socket.on("message", (rawMessage) => { try { const payload = JSON.parse(rawMessage.toString()); if (payload.type !== "message" || !payload.message?.text) return; payload.message.senderId = user.id; payload.message.sender = user.name; payload.message.initials = user.initials; payload.message.color = user.color; const outgoing = JSON.stringify({ type: "message", message: payload.message }); for (const client of clients) if (client.readyState === 1) client.send(outgoing); } catch { /* Ignore malformed client payloads. */ } });
	socket.on("close", () => clients.delete(socket));
});
httpServer.on("upgrade", async (request, socket, head) => {
	const requestUrl = new URL(request.url || "/", `http://${request.headers.host}`);
	if (requestUrl.pathname !== "/ws") return handleUpgrade(request, socket, head);
	const token = requestUrl.searchParams.get("token") || "";
	const user = await userFromToken(token);
	if (!user) return socket.destroy();
	socketServer.handleUpgrade(request, socket, head, (client) => socketServer.emit("connection", client, user));
});
httpServer.listen(port, () => console.log(`> Workspace chat ready on http://localhost:${port}`));
