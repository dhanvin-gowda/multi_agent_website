import { NextResponse } from "next/server";
import { z } from "zod";

const LYZR_BASE_URL = "https://agent-prod.studio.lyzr.ai";

const requestSchema = z.object({
	conversationId: z.string().min(1),
	transcriptText: z.string().min(1),
});

type ManagedAgent = { id: string; name: string; usage_description: string };

function loadManagedAgents(): ManagedAgent[] {
	const rawAgents = process.env["LYZR_MANAGED_AGENTS"];
	if (!rawAgents) return [];
	try {
		const parsed = JSON.parse(rawAgents) as unknown;
		return Array.isArray(parsed) ? (parsed as ManagedAgent[]) : [];
	} catch {
		return [];
	}
}

function resolveAgentName(raw: string | null): string | null {
	if (!raw) return null;
	const toolPrefix = "agent_tool_";
	const idx = raw.lastIndexOf(toolPrefix);
	const id = idx >= 0 ? raw.slice(idx + toolPrefix.length) : raw;
	const matched = loadManagedAgents().find((agent) => agent.id === id || agent.name === raw);
	return matched?.name ?? null;
}

export async function POST(request: Request) {
	const apiKey = process.env["LYZR_API_KEY"];
	const managerAgentId = process.env["LYZR_MANAGER_AGENT_ID"];

	if (!apiKey) {
		return NextResponse.json(
			{ error: "LYZR_API_KEY is not configured. Add it to .env." },
			{ status: 500 },
		);
	}

	if (!managerAgentId) {
		return NextResponse.json(
			{ error: "LYZR_MANAGER_AGENT_ID is not configured. Add it to .env." },
			{ status: 500 },
		);
	}

	let body;
	try {
		body = requestSchema.parse(await request.json());
	} catch {
		return NextResponse.json(
			{ error: "Invalid request body. Expected { conversationId, transcriptText }." },
			{ status: 400 },
		);
	}

	const managedAgents = loadManagedAgents();

	try {
		const response = await fetch(`${LYZR_BASE_URL}/v3/inference/chat/`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": apiKey,
			},
			body: JSON.stringify({
				user_id: process.env["LYZR_USER_ID"] || "default_user",
				agent_id: managerAgentId,
				session_id: `omi-${body.conversationId}`,
				message: body.transcriptText,
				managed_agents: managedAgents,
			}),
			cache: "no-store",
		});

		if (!response.ok) {
			const detail = await response.text();
			return NextResponse.json(
				{ error: `Lyzr responded with status ${response.status}.`, detail },
				{ status: response.status },
			);
		}

		const result = (await response.json()) as { response?: string };

		let agent: string | null = null;
		let responseText = (result.response ?? "").trim();

		const agentLine = responseText.match(/^AGENT:\s*([^\r\n]+)/);
		if (agentLine) {
			agent = resolveAgentName(agentLine[1].trim());
			responseText = responseText.replace(/^AGENT:\s*[^\r\n]+[\r\n]?/, "").trim();
		} else {
			try {
				const envelope = JSON.parse(responseText) as { agent?: string; response?: string };
				if (typeof envelope.response === "string") {
					if (typeof envelope.agent === "string") {
						agent = resolveAgentName(envelope.agent);
					}
					responseText = envelope.response.trim();
				}
			} catch {
				// fall through to the loose label parsing below
			}

			const looseAgent = responseText.match(/(?:^|\r?\n)\s*agent:\s*([^\r\n]+)/i);
			if (looseAgent) {
				const resolved = resolveAgentName(looseAgent[1].trim());
				if (resolved) {
					agent = resolved;
				}
			}

			const looseResponse = responseText.match(/(?:^|\r?\n)\s*response:\s*([\s\S]*)$/i);
			if (looseResponse) {
				responseText = looseResponse[1].trim();
			}
		}

		return NextResponse.json({ agent, response: responseText }, {
			headers: { "Cache-Control": "no-store" },
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		return NextResponse.json(
			{ error: "Failed to reach the Lyzr API.", detail: message },
			{ status: 502 },
		);
	}
}