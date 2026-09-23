import "dotenv/config";
import { createServer } from "node:http";
import next from "next";

const port = Number(process.env.PORT || 3000);
const dev = !process.argv.includes("--production") && process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

await app.prepare();

const httpServer = createServer((request, response) => {
	handle(request, response);
});

httpServer.listen(port, () => {
	console.log(`> Workspace chat ready on http://localhost:${port}`);
});
