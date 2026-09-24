import { NextResponse } from "next/server";

const OMI_BASE_URL = "https://api.omi.me/v1/dev";

export async function GET(request: Request) {
	const apiKey = process.env.OMI_API_KEY;

	if (!apiKey) {
		return NextResponse.json({ error: "OMI_API_KEY is not configured." }, { status: 500 });
	}

	const { searchParams } = new URL(request.url);
	const limit = searchParams.get("limit") ?? "5";
	const includeTranscript = searchParams.get("include_transcript") ?? "true";

	try {
		const response = await fetch(
			`${OMI_BASE_URL}/user/conversations?limit=${encodeURIComponent(limit)}&include_transcript=${encodeURIComponent(includeTranscript)}`,
			{
				headers: {
					Authorization: `Bearer ${apiKey}`,
				},
				cache: "no-store",
			},
		);

		if (!response.ok) {
			const detail = await response.text();
			return NextResponse.json(
				{ error: `Omi responded with status ${response.status}.`, detail },
				{ status: response.status },
			);
		}

		const conversations = await response.json();
		return NextResponse.json(conversations, {
			headers: { "Cache-Control": "no-store" },
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		return NextResponse.json({ error: "Failed to reach the Omi API.", detail: message }, { status: 502 });
	}
}
