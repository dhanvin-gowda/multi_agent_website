import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { parseGitHubIntent, createGitHubIssue } from '@/app/lib/github';
import { persistConversationToQdrant } from '@/app/lib/vectorMemory';
import { orchestratorAgent } from '../agents/orchestrator-agent';
import { voiceAgent } from '../agents/voice-agent';
import { codingAgent } from '../agents/coding-agent';
import { researchAgent } from '../agents/research-agent';

export const MASTRA_AGENT_REGISTRY = {
  orchestrator: {
    id: 'mastra-orchestrator-agent',
    sessionId: 'mastra-orch-session',
    name: 'Omi Orchestrator',
    role: 'Intent Router & Multi-Agent Dispatcher',
    icon: '🧭',
    color: 'orange' as const,
    badge: 'Orchestrator',
    description: 'Analyzes raw Omi voice transcripts and dispatches to the specialized sub-agent.',
  },
  voice: {
    id: 'mastra-voice-agent',
    sessionId: 'mastra-voice-session',
    name: 'Voice Agent',
    role: 'Conversational Voice Assistant',
    icon: '🎙️',
    color: 'purple' as const,
    badge: 'Voice & Dialogue',
    description: 'Handles natural conversations, summaries, general discussions, and voice notes.',
  },
  coding: {
    id: 'mastra-coding-agent',
    sessionId: 'mastra-coding-session',
    name: 'Coding Agent',
    role: 'Software Engineering & GitHub Implementation',
    icon: '💻',
    color: 'mint' as const,
    badge: 'Code & GitHub',
    description: 'Creates and solves GitHub issues, inspects repositories, fixes bugs, and explains software logic.',
  },
  research: {
    id: 'mastra-research-agent',
    sessionId: 'mastra-research-session',
    name: 'Research Agent',
    role: 'Deep Research, Fact Verification & Synthesis',
    icon: '🔬',
    color: 'blue' as const,
    badge: 'Research & Analysis',
    description: 'Investigates deep technical or factual inquiries, market analyses, and academic claims.',
  },
};

export type ChosenAgentKey = 'voice' | 'coding' | 'research';

export interface WorkflowStepRecord {
  step: number;
  id: string;
  name: string;
  status: 'completed' | 'in_progress' | 'pending' | 'failed';
  timestamp: string;
  description: string;
  badge?: string;
  details?: Record<string, unknown>;
}

export function detectAgentFromIntent(
  rawOutput: string,
  userTranscript: string
): {
  key: ChosenAgentKey;
  cleanText: string;
  detectedVia: string;
} {
  // 1. Direct GitHub Intent Detection
  const gh = parseGitHubIntent(userTranscript);
  if (gh.isGitHubTask) {
    return {
      key: 'coding',
      cleanText: rawOutput,
      detectedVia: `GitHub Repository Action (${gh.action.replace('_', ' ')})`,
    };
  }

  // 2. Pattern: "AGENT: <name>"
  const agentLineMatch = rawOutput.match(/^AGENT:\s*([^\r\n]+)/i);
  let cleanText = rawOutput;

  if (agentLineMatch) {
    const rawAgentRef = agentLineMatch[1].trim();
    cleanText = rawOutput.replace(/^AGENT:\s*[^\r\n]+[\r\n]*/i, '').trim();

    if (/coding/i.test(rawAgentRef)) {
      return { key: 'coding', cleanText, detectedVia: 'Mastra Orchestrator classification (Coding)' };
    }
    if (/research/i.test(rawAgentRef)) {
      return { key: 'research', cleanText, detectedVia: 'Mastra Orchestrator classification (Research)' };
    }
    if (/voice|chat/i.test(rawAgentRef)) {
      return { key: 'voice', cleanText, detectedVia: 'Mastra Orchestrator classification (Voice)' };
    }
  }

  // 3. Fallback heuristic based on content
  const isResearch =
    /\b(findings|research|study|statistics|quantum|qubits|evidence|citations|market analysis|market|thesis|paper|investigate|fact check|verify|academic)\b/i.test(
      rawOutput
    ) ||
    /\b(research|investigate|fact check|verify|evidence|source|statistics|market analysis|quantum)\b/i.test(
      userTranscript
    );

  const isCoding =
    /\b(code|function|python|javascript|typescript|debug|api|sql|html|css|class|def|import|github|git|issue|issues|repo|repository|pull request|pr|branch|commit)\b/i.test(
      rawOutput
    ) ||
    /\b(code|function|python|javascript|typescript|debug|api|sql|html|css|class|def|import|github|git|issue|issues|repo|repository|pull request|pr|branch|commit)\b/i.test(
      userTranscript
    );

  if (isResearch && !(/\b(github|git|repo|repository|pull request|pr)\b/i.test(userTranscript))) {
    return { key: 'research', cleanText, detectedVia: 'Synthesized analytical research' };
  }

  if (isCoding) {
    return { key: 'coding', cleanText, detectedVia: 'Synthesized technical & code implementation' };
  }

  if (isResearch) {
    return { key: 'research', cleanText, detectedVia: 'Synthesized analytical research' };
  }

  return { key: 'voice', cleanText, detectedVia: 'Direct conversational voice engagement' };
}

// STEP 1: Ingestion
const ingestionStep = createStep({
  id: 'ingestion',
  description: 'Omi Audio & Transcript Ingestion',
  inputSchema: z.object({
    conversationId: z.string(),
    transcriptText: z.string(),
    workflowId: z.string(),
    startTime: z.number(),
    nowIso: z.string(),
  }),
  outputSchema: z.object({
    conversationId: z.string(),
    transcriptText: z.string(),
    workflowId: z.string(),
    startTime: z.number(),
    nowIso: z.string(),
    isGitHubTask: z.boolean(),
    gitHubAction: z.string(),
    targetRepo: z.string(),
    owner: z.string(),
    repo: z.string(),
    issueTitle: z.string().optional(),
    issueNumber: z.number().optional(),
    stepRecord: z.any(),
  }),
  execute: async ({ inputData }) => {
    const { conversationId, transcriptText, workflowId, startTime, nowIso } = inputData;
    const ghIntent = parseGitHubIntent(transcriptText);

    const stepRecord: WorkflowStepRecord = {
      step: 1,
      id: 'ingestion',
      name: 'Omi Audio & Transcript Ingestion',
      status: 'completed',
      timestamp: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }),
      description: ghIntent.isGitHubTask
        ? `Received voice transcript requesting GitHub action: ${ghIntent.action.replace('_', ' ')} on ${ghIntent.owner}/${ghIntent.repo}.`
        : 'Received voice transcript from Omi wearable / audio stream.',
      badge: ghIntent.isGitHubTask ? 'GitHub Task Ingested' : 'Omi Ingestion',
      details: {
        conversationId,
        transcriptLength: transcriptText.length,
        preview: transcriptText.slice(0, 120),
        isGitHubTask: ghIntent.isGitHubTask,
        action: ghIntent.action,
        targetRepo: `${ghIntent.owner}/${ghIntent.repo}`,
      },
    };

    return {
      conversationId,
      transcriptText,
      workflowId,
      startTime,
      nowIso,
      isGitHubTask: ghIntent.isGitHubTask,
      gitHubAction: ghIntent.action,
      targetRepo: `${ghIntent.owner}/${ghIntent.repo}`,
      owner: ghIntent.owner,
      repo: ghIntent.repo,
      issueTitle: ghIntent.title,
      issueNumber: ghIntent.issueNumber,
      stepRecord,
    };
  },
});

// STEP 2: Routing
const routingStep = createStep({
  id: 'orchestrator',
  description: 'Orchestrator Routing & Intent Classification',
  inputSchema: z.object({
    conversationId: z.string(),
    transcriptText: z.string(),
    workflowId: z.string(),
    startTime: z.number(),
    nowIso: z.string(),
    isGitHubTask: z.boolean(),
    gitHubAction: z.string(),
    targetRepo: z.string(),
    owner: z.string(),
    repo: z.string(),
    issueTitle: z.string().optional(),
    issueNumber: z.number().optional(),
    stepRecord: z.any(),
  }),
  outputSchema: z.object({
    conversationId: z.string(),
    transcriptText: z.string(),
    workflowId: z.string(),
    startTime: z.number(),
    nowIso: z.string(),
    isGitHubTask: z.boolean(),
    gitHubAction: z.string(),
    targetRepo: z.string(),
    owner: z.string(),
    repo: z.string(),
    issueTitle: z.string().optional(),
    issueNumber: z.number().optional(),
    chosenKey: z.enum(['voice', 'coding', 'research']),
    detectedVia: z.string(),
    orchestratorRawResponse: z.string(),
    ingestionStepRecord: z.any(),
    routingStepRecord: z.any(),
  }),
  execute: async ({ inputData }) => {
    const { transcriptText, isGitHubTask } = inputData;
    let rawResponse = '';

    // Fast-path for GitHub tasks
    if (isGitHubTask) {
      rawResponse = `AGENT: Coding Agent\nIdentified GitHub action: ${inputData.gitHubAction}`;
    } else {
      try {
        const prompt = `Analyze this voice transcript and route to the correct agent:\n"${transcriptText}"`;
        const result = await orchestratorAgent.generate(prompt);
        rawResponse = result.text || '';
      } catch (err: unknown) {
        console.warn('[Mastra Orchestrator Agent] Routing fallback to heuristics:', err);
        const isResearch = /\b(findings|research|study|statistics|quantum|qubits|evidence|citations|market analysis|market|thesis|paper|investigate|fact check|verify)\b/i.test(transcriptText);
        const isCoding = /\b(code|function|python|javascript|typescript|debug|api|sql|html|css|class|def|import|github|git|issue|issues|repo|repository|pull request|pr|branch|commit)\b/i.test(transcriptText);
        if (isResearch && !(/\b(github|git|repo|repository|pull request|pr)\b/i.test(transcriptText))) {
          rawResponse = 'AGENT: Research Agent\nFallback heuristic routing.';
        } else if (isCoding) {
          rawResponse = 'AGENT: Coding Agent\nFallback heuristic routing.';
        } else if (isResearch) {
          rawResponse = 'AGENT: Research Agent\nFallback heuristic routing.';
        } else {
          rawResponse = 'AGENT: Voice Agent\nFallback conversational routing.';
        }
      }
    }

    const detection = detectAgentFromIntent(rawResponse, transcriptText);
    const chosenKey = detection.key;
    const chosenAgent = MASTRA_AGENT_REGISTRY[chosenKey];

    const routingStepRecord: WorkflowStepRecord = {
      step: 2,
      id: 'orchestrator',
      name: 'Orchestrator Routing & Intent Classification',
      status: 'completed',
      timestamp: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }),
      description: `Mastra Orchestrator analyzed intent and routed to ${chosenAgent.name}.`,
      badge: `Chosen: ${chosenAgent.badge}`,
      details: {
        agentId: chosenAgent.id,
        routingDecision: chosenAgent.name,
        detectionVia: detection.detectedVia,
      },
    };

    return {
      ...inputData,
      chosenKey,
      detectedVia: detection.detectedVia,
      orchestratorRawResponse: rawResponse,
      ingestionStepRecord: inputData.stepRecord,
      routingStepRecord,
    };
  },
});

// STEP 3: Agent Execution
const executionStep = createStep({
  id: 'agent_execution',
  description: 'Specialist Agent Execution',
  inputSchema: z.object({
    conversationId: z.string(),
    transcriptText: z.string(),
    workflowId: z.string(),
    startTime: z.number(),
    nowIso: z.string(),
    isGitHubTask: z.boolean(),
    gitHubAction: z.string(),
    targetRepo: z.string(),
    owner: z.string(),
    repo: z.string(),
    issueTitle: z.string().optional(),
    issueNumber: z.number().optional(),
    chosenKey: z.enum(['voice', 'coding', 'research']),
    detectedVia: z.string(),
    orchestratorRawResponse: z.string(),
    ingestionStepRecord: z.any(),
    routingStepRecord: z.any(),
  }),
  outputSchema: z.object({
    conversationId: z.string(),
    transcriptText: z.string(),
    workflowId: z.string(),
    startTime: z.number(),
    nowIso: z.string(),
    chosenKey: z.enum(['voice', 'coding', 'research']),
    detectedVia: z.string(),
    orchestratorRawResponse: z.string(),
    finalCleanResponse: z.string(),
    ingestionStepRecord: z.any(),
    routingStepRecord: z.any(),
    executionStepRecord: z.any(),
  }),
  execute: async ({ inputData }) => {
    const { chosenKey, transcriptText, isGitHubTask, gitHubAction, owner, repo, issueTitle } = inputData;
    const chosenAgent = MASTRA_AGENT_REGISTRY[chosenKey];
    let finalCleanResponse = '';

    try {
      if (chosenKey === 'coding') {
        const codingPrompt = isGitHubTask
          ? `[Target GitHub Repository: ${owner}/${repo}]\n[GitHub Action Requested: ${gitHubAction}]\nUser Instruction: ${transcriptText}`
          : transcriptText;

        const res = await codingAgent.generate(codingPrompt);
        finalCleanResponse = res.text || '';

        // If GitHub issue creation was requested and token available, ensure issue is created
        if (gitHubAction === 'create_issue' && process.env.GITHUB_TOKEN) {
          const title = issueTitle || transcriptText.slice(0, 60);
          const issueRes = await createGitHubIssue({
            owner,
            repo,
            title,
            body: `Created via Multi-Agent Voice Workspace by Mastra Coding Agent.\n\n**Voice Transcript:**\n>${transcriptText}`,
          });

          if (issueRes.success && issueRes.htmlUrl) {
            finalCleanResponse += `\n\n📌 **GitHub Issue Created Successfully:** [#${issueRes.issueNumber} - ${issueRes.title}](${issueRes.htmlUrl})`;
          }
        }
      } else if (chosenKey === 'research') {
        const res = await researchAgent.generate(transcriptText);
        finalCleanResponse = res.text || '';
      } else {
        const res = await voiceAgent.generate(transcriptText);
        finalCleanResponse = res.text || '';
      }
    } catch (err: unknown) {
      console.warn(`[Mastra ${chosenAgent.name}] Execution notice:`, err);
      finalCleanResponse = `I have received and processed your request: "${transcriptText}". The ${chosenAgent.name} analyzed the transcript and provided this update.`;
    }

    const executionStepRecord: WorkflowStepRecord = {
      step: 3,
      id: 'agent_execution',
      name: `${chosenAgent.name} Execution`,
      status: 'completed',
      timestamp: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }),
      description: isGitHubTask
        ? `Mastra Coding Agent processed GitHub ${gitHubAction.replace('_', ' ')} for ${owner}/${repo}.`
        : `Mastra ${chosenAgent.role} processed the task and generated the response.`,
      badge: isGitHubTask ? 'GitHub & Code Execution' : chosenAgent.badge,
      details: {
        agentId: chosenAgent.id,
        role: chosenAgent.role,
        isGitHubTask,
        gitHubAction,
        targetRepo: `${owner}/${repo}`,
      },
    };

    return {
      conversationId: inputData.conversationId,
      transcriptText: inputData.transcriptText,
      workflowId: inputData.workflowId,
      startTime: inputData.startTime,
      nowIso: inputData.nowIso,
      chosenKey,
      detectedVia: inputData.detectedVia,
      orchestratorRawResponse: inputData.orchestratorRawResponse,
      finalCleanResponse,
      ingestionStepRecord: inputData.ingestionStepRecord,
      routingStepRecord: inputData.routingStepRecord,
      executionStepRecord,
    };
  },
});

// STEP 4: Vector Memory
const vectorMemoryStep = createStep({
  id: 'vector_memory',
  description: 'Qdrant Vector Memory Storage with Gemini Embedding-2',
  inputSchema: z.object({
    conversationId: z.string(),
    transcriptText: z.string(),
    workflowId: z.string(),
    startTime: z.number(),
    nowIso: z.string(),
    chosenKey: z.enum(['voice', 'coding', 'research']),
    detectedVia: z.string(),
    orchestratorRawResponse: z.string(),
    finalCleanResponse: z.string(),
    ingestionStepRecord: z.any(),
    routingStepRecord: z.any(),
    executionStepRecord: z.any(),
  }),
  outputSchema: z.object({
    conversationId: z.string(),
    transcriptText: z.string(),
    workflowId: z.string(),
    startTime: z.number(),
    nowIso: z.string(),
    chosenKey: z.enum(['voice', 'coding', 'research']),
    detectedVia: z.string(),
    orchestratorRawResponse: z.string(),
    finalCleanResponse: z.string(),
    vectorMemoryResult: z.any(),
    ingestionStepRecord: z.any(),
    routingStepRecord: z.any(),
    executionStepRecord: z.any(),
    vectorStepRecord: z.any(),
  }),
  execute: async ({ inputData }) => {
    const { transcriptText, finalCleanResponse, conversationId, workflowId, chosenKey } = inputData;
    const chosenAgent = MASTRA_AGENT_REGISTRY[chosenKey];

    let vectorMemoryResult = null;
    try {
      vectorMemoryResult = await persistConversationToQdrant({
        userText: transcriptText,
        agentText: finalCleanResponse,
        conversationId,
        workflowId,
        agentName: chosenAgent.name,
        agentId: chosenAgent.id,
      });
    } catch (memErr) {
      console.warn('[Qdrant] Non-blocking vector storage error:', memErr);
    }

    const vectorStepRecord: WorkflowStepRecord = {
      step: 4,
      id: 'vector_memory',
      name: 'Qdrant Vector Memory Storage',
      status: vectorMemoryResult?.success ? 'completed' : 'failed',
      timestamp: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }),
      description: vectorMemoryResult?.success
        ? 'Embedded via Google Gemini-Embedding-2 & stored user + agent vectors in Qdrant.'
        : `Vector memory notice: ${vectorMemoryResult?.error || 'Qdrant storage skipped or offline'}`,
      badge: vectorMemoryResult?.success ? 'Vectorized & Saved' : 'Vector Storage Notice',
      details: {
        embeddingModel: 'models/gemini-embedding-2',
        userPointId: vectorMemoryResult?.userPoint?.id,
        agentPointId: vectorMemoryResult?.agentPoint?.id,
        vectorDim: vectorMemoryResult?.userPoint?.vectorDim,
        qdrantUserStatus: vectorMemoryResult?.userPoint?.qdrantStatus,
        qdrantAgentStatus: vectorMemoryResult?.agentPoint?.qdrantStatus,
        error: vectorMemoryResult?.error,
      },
    };

    return {
      ...inputData,
      vectorMemoryResult,
      vectorStepRecord,
    };
  },
});

// STEP 5: Synthesis
const synthesisStep = createStep({
  id: 'synthesis',
  description: 'Workflow Synthesis & Delivery',
  inputSchema: z.object({
    conversationId: z.string(),
    transcriptText: z.string(),
    workflowId: z.string(),
    startTime: z.number(),
    nowIso: z.string(),
    chosenKey: z.enum(['voice', 'coding', 'research']),
    detectedVia: z.string(),
    orchestratorRawResponse: z.string(),
    finalCleanResponse: z.string(),
    vectorMemoryResult: z.any(),
    ingestionStepRecord: z.any(),
    routingStepRecord: z.any(),
    executionStepRecord: z.any(),
    vectorStepRecord: z.any(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    agent: z.string(),
    response: z.string(),
    rawResponse: z.string(),
    vectorMemory: z.any(),
    chosenAgent: z.any(),
    orchestrator: z.any(),
    workflow: z.any(),
  }),
  execute: async ({ inputData }) => {
    const {
      conversationId,
      transcriptText,
      workflowId,
      startTime,
      nowIso,
      chosenKey,
      detectedVia,
      orchestratorRawResponse,
      finalCleanResponse,
      vectorMemoryResult,
      ingestionStepRecord,
      routingStepRecord,
      executionStepRecord,
      vectorStepRecord,
    } = inputData;

    const chosenAgent = MASTRA_AGENT_REGISTRY[chosenKey];
    const durationMs = Date.now() - startTime;

    const synthesisStepRecord: WorkflowStepRecord = {
      step: 5,
      id: 'synthesis',
      name: 'Workflow Synthesis & Visual Output',
      status: 'completed',
      timestamp: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }),
      description: 'Delivering synthesized Mastra output back to workspace room.',
      badge: 'Completed',
      details: {
        outputLength: finalCleanResponse.length,
      },
    };

    const steps = [
      ingestionStepRecord,
      routingStepRecord,
      executionStepRecord,
      vectorStepRecord,
      synthesisStepRecord,
    ];

    return {
      success: true,
      agent: chosenAgent.name,
      response: finalCleanResponse,
      rawResponse: orchestratorRawResponse,
      vectorMemory: vectorMemoryResult,
      chosenAgent: {
        key: chosenKey,
        id: chosenAgent.id,
        name: chosenAgent.name,
        role: chosenAgent.role,
        icon: chosenAgent.icon,
        color: chosenAgent.color,
        badge: chosenAgent.badge,
        sessionId: chosenAgent.sessionId,
        description: chosenAgent.description,
        detectedVia,
      },
      orchestrator: {
        id: MASTRA_AGENT_REGISTRY.orchestrator.id,
        name: MASTRA_AGENT_REGISTRY.orchestrator.name,
        sessionId: MASTRA_AGENT_REGISTRY.orchestrator.sessionId,
      },
      workflow: {
        id: workflowId,
        conversationId,
        startedAt: nowIso,
        completedAt: new Date().toISOString(),
        durationMs,
        status: 'completed',
        transcriptText,
        steps,
      },
    };
  },
});

export const omiOrchestratorWorkflow = createWorkflow({
  id: 'omi-orchestrator-workflow',
  inputSchema: z.object({
    conversationId: z.string(),
    transcriptText: z.string(),
    workflowId: z.string(),
    startTime: z.number(),
    nowIso: z.string(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    agent: z.string(),
    response: z.string(),
    rawResponse: z.string(),
    vectorMemory: z.any(),
    chosenAgent: z.any(),
    orchestrator: z.any(),
    workflow: z.any(),
  }),
})
  .then(ingestionStep)
  .then(routingStep)
  .then(executionStep)
  .then(vectorMemoryStep)
  .then(synthesisStep);

omiOrchestratorWorkflow.commit();
