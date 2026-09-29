import { NextResponse } from 'next/server';
import { z } from 'zod';
import { omiOrchestratorWorkflow, MASTRA_AGENT_REGISTRY } from '@/src/mastra/workflows/omi-orchestrator-workflow';

export { MASTRA_AGENT_REGISTRY as AGENT_REGISTRY };

const requestSchema = z.object({
  conversationId: z.string().optional().default(() => `omi-${Date.now()}`),
  transcriptText: z.string().min(1, 'Transcript text is required'),
});

export async function POST(request: Request) {
  const startTime = Date.now();
  let body;
  try {
    const rawJson = await request.json();
    body = requestSchema.parse(rawJson);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Invalid payload';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const conversationId = body.conversationId;
  const transcriptText = body.transcriptText.trim();
  const workflowId = `wf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const nowIso = new Date().toISOString();

  try {
    const run = await omiOrchestratorWorkflow.createRun();
    const runResult = await run.start({
      inputData: {
        conversationId,
        transcriptText,
        workflowId,
        startTime,
        nowIso,
      },
    });

    if (runResult.status === 'success' && runResult.result) {
      return NextResponse.json(runResult.result, {
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    throw new Error('Workflow execution failed or produced incomplete results');
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : 'Mastra Orchestration failed';
    const durationMs = Date.now() - startTime;

    return NextResponse.json(
      {
        success: false,
        error: errorMsg,
        workflow: {
          id: workflowId,
          conversationId,
          startedAt: nowIso,
          completedAt: new Date().toISOString(),
          durationMs,
          status: 'failed',
          transcriptText,
          steps: [
            {
              step: 1,
              id: 'ingestion',
              name: 'Omi Audio & Transcript Ingestion',
              status: 'completed',
              timestamp: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
              description: 'Received voice transcript from Omi wearable.',
            },
            {
              step: 2,
              id: 'failure',
              name: 'Execution Error',
              status: 'failed',
              timestamp: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
              description: errorMsg,
              badge: 'Failed',
              details: { error: errorMsg },
            },
          ],
        },
      },
      { status: 502 }
    );
  }
}
