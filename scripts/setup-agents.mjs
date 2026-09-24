import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const ENV_PATH = join(ROOT, ".env");
const BASE_URL = "https://agent-prod.studio.lyzr.ai";

const AGENT_DEFS = [
	{
		name: "Chat agent",
		description: "Conversational assistant that explains, summarizes, and discusses topics naturally.",
		agent_role: "Conversational assistant",
		agent_goal: "Respond to questions and discuss the transcript in a clear, natural, helpful way.",
		agent_instructions:
			"You are a friendly assistant. Read the Omi transcript and answer the user's questions, summarize, and explain concepts clearly and concisely.",
		agent_output: "A clear, conversational response addressing the transcript content.",
		provider_id: "openai",
		model: "gpt-4o",
		top_p: 1,
		temperature: 0.7,
	},
	{
		name: "Research agent",
		description: "Investigates, verifies claims, and gathers detailed information.",
		agent_role: "Research specialist",
		agent_goal: "Find accurate information, verify facts, and provide well-sourced analyses from the transcript.",
		agent_instructions:
			"You are a research specialist. Analyze the Omi transcript, identify claims and open questions, and provide thorough, accurate findings.",
		agent_output: "A detailed research summary with verified facts and clear reasoning.",
		provider_id: "openai",
		model: "gpt-4o",
		top_p: 1,
		temperature: 0.7,
	},
	{
		name: "Coding agent",
		description: "Writes, reviews, and debugs code mentioned in the conversation.",
		agent_role: "Software engineer",
		agent_goal: "Turn the transcript's technical content into working code, reviews, and bug fixes.",
		agent_instructions:
			"You are a senior software engineer. From the Omi transcript, implement, review, or debug the relevant code. Follow the language and stack implied by the conversation.",
		agent_output: "Working code, a code review, or a clear explanation of the fix.",
		provider_id: "openai",
		model: "gpt-4o",
		top_p: 1,
		temperature: 0.7,
	},
];

const MANAGER_DEF = {
	name: "Omi Orchestrator",
	description: "Routes incoming Omi transcripts to the best-suited sub-agent (chat, research, or coding) and reports which one handled it.",
	agent_role: "Manager / orchestrator",
	agent_goal:
		"Read each incoming Omi transcript and dispatch it to the single sub-agent best suited to the content, then report the chosen agent and its response.",
	agent_instructions:
		'You are the orchestrator of a managed multi-agent system. Given an incoming Omi transcript, choose exactly ONE managed agent from the provided list based on its usage_description and dispatch the transcript to it. Reply with exactly two parts, nothing else: the first line must be exactly "AGENT: <exact name of the managed agent that handled it>", followed by a line break, then the full response produced by that managed agent, verbatim.',
	agent_output:
		'The first line is "AGENT: <managed agent name>". Everything after the first line is the managed agent\'s full response, verbatim.',
	provider_id: "openai",
	model: "gpt-4o",
	top_p: 1,
	temperature: 0.7,
};

function loadEnv() {
	const parsed = {};
	for (const line of readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const idx = trimmed.indexOf("=");
		if (idx === -1) continue;
		const key = trimmed.slice(0, idx).trim();
		const value = trimmed.slice(idx + 1).trim();
		parsed[key] = value;
	}
	return parsed;
}

function saveEnv(values) {
	let content = readFileSync(ENV_PATH, "utf8");
	for (const [key, value] of Object.entries(values)) {
		const re = new RegExp(`^${key}=.*$`, "m");
		if (re.test(content)) {
			content = content.replace(re, `${key}=${value}`);
		} else {
			content += `${key}=${value}\n`;
		}
	}
	writeFileSync(ENV_PATH, content, "utf8");
}

async function apiRequest(method, path, apiKey, body) {
	const response = await fetch(`${BASE_URL}${path}`, {
		method,
		headers: { "Content-Type": "application/json", "x-api-key": apiKey },
		body: body ? JSON.stringify(body) : undefined,
	});
	if (!response.ok) {
		throw new Error(`${method} ${path} failed (${response.status}): ${await response.text()}`);
	}
	return response.json();
}

async function ensureAgent(apiKey, def, existingId) {
	if (existingId) {
		await apiRequest("PUT", `/v3/agents/${existingId}`, apiKey, def);
		return existingId;
	}
	const data = await apiRequest("POST", "/v3/agents/", apiKey, def);
	return data.agent_id;
}

async function main() {
	const env = loadEnv();
	const apiKey = env.LYZR_API_KEY;
	if (!apiKey) {
		console.error("LYZR_API_KEY is not set in .env");
		process.exitCode = 1;
		return;
	}

	let existingManaged = [];
	try {
		const parsed = JSON.parse(env.LYZR_MANAGED_AGENTS || "[]");
		if (Array.isArray(parsed)) existingManaged = parsed;
	} catch {
		existingManaged = [];
	}

	const managedAgents = [];
	for (const def of AGENT_DEFS) {
		const existing = existingManaged.find((agent) => agent.name === def.name);
		if (existing?.id) {
			await ensureAgent(apiKey, def, existing.id);
			console.log(`updated ${def.name}: ${existing.id}`);
			managedAgents.push({ id: existing.id, name: def.name, usage_description: def.description });
		} else {
			const id = await ensureAgent(apiKey, def, null);
			console.log(`created ${def.name}: ${id}`);
			managedAgents.push({ id, name: def.name, usage_description: def.description });
		}
	}

	const managerDef = { ...MANAGER_DEF, managed_agents: managedAgents };
	let managerId = env.LYZR_MANAGER_AGENT_ID || null;
	if (managerId) {
		await ensureAgent(apiKey, managerDef, managerId);
		console.log(`updated Omi Orchestrator: ${managerId}`);
	} else {
		managerId = await ensureAgent(apiKey, managerDef, null);
		console.log(`created Omi Orchestrator: ${managerId}`);
	}

	saveEnv({
		LYZR_MANAGER_AGENT_ID: managerId,
		LYZR_MANAGED_AGENTS: JSON.stringify(managedAgents),
	});

	console.log("\n.env synced:");
	console.log(`LYZR_MANAGER_AGENT_ID=${managerId}`);
	console.log(`LYZR_MANAGED_AGENTS=${JSON.stringify(managedAgents)}`);
}

main().catch((error) => {
	console.error(error.message);
	process.exitCode = 1;
});