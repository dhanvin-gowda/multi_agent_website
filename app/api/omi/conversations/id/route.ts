import { NextResponse } from "next/server";

const OMI_BASE_URL = "https://api.omi.me/v1/dev";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteContext) {
	const apiKey = process.env.OMI_API_KEY;
	const { id } = await params;

	if (!apiKey) {
		return NextResponse.json({ error: "OMI_API_KEY is not configured." }, { status: 500 });
	}

	if (!id) {
		return NextResponse.json({ error: "Missing conversation id." }, { status: 400 });
	}

	const includeTranscript = new URL(request.url).searchParams.get("include_transcript") ?? "true";

	try {
		const response = await fetch(
			`${OMI_BASE_URL}/user/conversations/${encodeURIComponent(id)}?include_transcript=${encodeURIComponent(includeTranscript)}`,
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

		const conversation = await response.json();
		return NextResponse.json(conversation, {
			headers: { "Cache-Control": "no-store" },
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		return NextResponse.json({ error: "Failed to reach the Omi API.", detail: message }, { status: 502 });
	}
}
