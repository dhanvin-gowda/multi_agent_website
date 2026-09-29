"use client";

import React, { useState } from "react";

export type WorkflowStep = {
  step: number;
  id: string;
  name: string;
  status: "completed" | "in_progress" | "pending" | "failed";
  timestamp: string;
  description: string;
  badge?: string;
  details?: Record<string, unknown>;
};

export type AgentDetail = {
  key?: string;
  id: string;
  name: string;
  role: string;
  icon: string;
  color: "orange" | "mint" | "blue" | "purple";
  badge: string;
  sessionId: string;
  description?: string;
  detectedVia?: string;
};

export type WorkflowRun = {
  id: string;
  conversationId: string;
  timestamp: string;
  transcript: string;
  durationMs: number;
  status: "completed" | "running" | "failed";
  chosenAgent: AgentDetail;
  orchestrator: {
    id: string;
    name: string;
    sessionId: string;
  };
  steps: WorkflowStep[];
  response: string;
  rawResponse?: string;
  error?: string;
};

const REGISTERED_AGENTS: Record<string, AgentDetail> = {
  orchestrator: {
    key: "orchestrator",
    id: "6ab55e4654c80e95195e7cd5",
    sessionId: "6ab55e4654c80e95195e7cd5-w1fbkwqc",
    name: "Omi Orchestrator",
    role: "Intent Router & Multi-Agent Dispatcher",
    icon: "🧭",
    color: "orange",
    badge: "Orchestrator",
    description: "Evaluates raw voice transcripts from Omi and dispatches to specialized sub-agents.",
  },
  voice: {
    key: "voice",
    id: "6ab55e3f01d4f5fcb2df0d36",
    sessionId: "6ab55e3f01d4f5fcb2df0d36-tzseycir",
    name: "Voice Agent",
    role: "Conversational Voice Assistant",
    icon: "🎙️",
    color: "purple",
    badge: "Voice & Dialogue",
    description: "Handles natural conversations, summaries, general discussions, and voice notes.",
  },
  coding: {
    key: "coding",
    id: "6ab55e4301d4f5fcb2df0d38",
    sessionId: "6ab55e4301d4f5fcb2df0d38-r2ybl7vl",
    name: "Coding Agent",
    role: "Software Engineering & GitHub Implementation",
    icon: "💻",
    color: "mint",
    badge: "Code & GitHub",
    description: "Creates and resolves GitHub issues, inspects repositories, writes clean code, and solves programming bugs.",
  },
  research: {
    key: "research",
    id: "6ab55e4272a639bfb70537e3",
    sessionId: "6ab55e4272a639bfb70537e3-gzdakpfm",
    name: "Research Agent",
    role: "Deep Research, Fact Verification & Synthesis",
    icon: "🔬",
    color: "blue",
    badge: "Research & Analysis",
    description: "Analyzes claims, synthesizes market & tech data, and verifies open queries.",
  },
};

const SAMPLE_TRANSCRIPTS = [
  {
    label: "🐙 Create GitHub Issue",
    agentHint: "Coding Agent",
    color: "mint",
    text: "Create an issue in repository dhanvin-gowda/multi_agent_website titled 'Fix responsive navbar toggle' describing that the mobile menu overlay does not close on selection.",
  },
  {
    label: "🛠️ Solve GitHub Issue",
    agentHint: "Coding Agent",
    color: "mint",
    text: "Check repository dhanvin-gowda/multi_agent_website and solve the issue with responsive navbar menu overlay with code fix and explanation.",
  },
  {
    label: "💻 Code Implementation",
    agentHint: "Coding Agent",
    color: "mint",
    text: "Can you write a Python function that connects to SQLite, creates a users table, and inserts a record safely with parameterized queries?",
  },
  {
    label: "🔬 Research Inquiry",
    agentHint: "Research Agent",
    color: "blue",
    text: "What are the latest findings regarding quantum computing qubits fidelity in 2024? Give me a factual summary.",
  },
  {
    label: "🎙️ Voice Dialogue",
    agentHint: "Voice Agent",
    color: "purple",
    text: "Hi there! Can you chat with me about why multi-agent AI architectures are becoming the future of software?",
  },
];

interface WorkflowViewProps {
  currentRun: WorkflowRun | null;
  history: WorkflowRun[];
  isRunning: boolean;
  onExecute: (text: string) => Promise<void>;
  onSelectRun: (run: WorkflowRun) => void;
  onSyncOmi?: () => Promise<void>;
}

export function WorkflowView({
  currentRun,
  history,
  isRunning,
  onExecute,
  onSelectRun,
  onSyncOmi,
}: WorkflowViewProps) {
  const [inputText, setInputText] = useState("");
  const [activeTab, setActiveTab] = useState<"diagram" | "steps" | "output" | "specs">("diagram");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const activeAgentKey = currentRun?.chosenAgent?.key ||
    (currentRun?.chosenAgent?.id === REGISTERED_AGENTS.coding.id ? "coding" :
     currentRun?.chosenAgent?.id === REGISTERED_AGENTS.research.id ? "research" :
     currentRun?.chosenAgent?.id === REGISTERED_AGENTS.voice.id ? "voice" : null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isRunning) return;
    onExecute(inputText.trim());
  };

  const handleSampleClick = (sampleText: string) => {
    setInputText(sampleText);
    onExecute(sampleText);
  };

  return (
    <div className="wf-container">
      {/* Top Banner / Status Bar */}
      <header className="wf-top-bar">
        <div className="wf-top-title">
          <div className="wf-badge-icon">🧭</div>
          <div>
            <h2>Mastra Multi-Agent Orchestrator</h2>
            <p>Omi Voice Ingestion ➔ Orchestrator Classification ➔ Specialized Agent Execution</p>
          </div>
        </div>

        <div className="wf-top-controls">
          {onSyncOmi && (
            <button
              type="button"
              className="wf-sync-btn"
              onClick={() => onSyncOmi()}
              disabled={isRunning}
            >
              <span className="wf-pulse-dot" />
              Sync Omi Wearable
            </button>
          )}
          {isRunning && (
            <div className="wf-running-pill">
              <span className="wf-spinner" />
              <span>Orchestrating...</span>
            </div>
          )}
        </div>
      </header>

      {/* Quick Test Console */}
      <section className="wf-test-console">
        <div className="wf-console-header">
          <span className="wf-console-title">Test Transcript Dispatch</span>
          <span className="wf-console-sub">Select a preset or input speech transcript</span>
        </div>

        <div className="wf-sample-chips">
          {SAMPLE_TRANSCRIPTS.map((sample, idx) => (
            <button
              key={idx}
              type="button"
              className={`wf-sample-chip wf-chip-${sample.color}`}
              onClick={() => handleSampleClick(sample.text)}
              disabled={isRunning}
            >
              <span>{sample.label}</span>
              <small>➔ {sample.agentHint}</small>
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="wf-input-form">
          <textarea
            className="wf-textarea"
            placeholder="Type transcript or speak via Omi device..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            rows={2}
            disabled={isRunning}
          />
          <button
            type="submit"
            className="wf-dispatch-btn"
            disabled={!inputText.trim() || isRunning}
          >
            {isRunning ? "Routing..." : "Dispatch to Orchestrator ➔"}
          </button>
        </form>
      </section>

      {/* Main Workflow Stage */}
      <div className="wf-main-grid">
        {/* Left Side: Pipeline Visualization & Tabs */}
        <section className="wf-visualizer-panel">
          <div className="wf-panel-tabs">
            <button
              type="button"
              className={`wf-tab-btn ${activeTab === "diagram" ? "active" : ""}`}
              onClick={() => setActiveTab("diagram")}
            >
              Visual Pipeline Graph
            </button>
            <button
              type="button"
              className={`wf-tab-btn ${activeTab === "steps" ? "active" : ""}`}
              onClick={() => setActiveTab("steps")}
            >
              Execution Timeline ({currentRun?.steps.length ?? 0})
            </button>
            <button
              type="button"
              className={`wf-tab-btn ${activeTab === "output" ? "active" : ""}`}
              onClick={() => setActiveTab("output")}
            >
              Output & Trace
            </button>
            <button
              type="button"
              className={`wf-tab-btn ${activeTab === "specs" ? "active" : ""}`}
              onClick={() => setActiveTab("specs")}
            >
              Agent Endpoints (4)
            </button>
          </div>

          <div className="wf-panel-content">
            {/* TAB 1: VISUAL PIPELINE GRAPH */}
            {activeTab === "diagram" && (
              <div className="wf-diagram-wrapper">
                {/* Stage 1: Ingestion Node */}
                <div className="wf-node wf-node-ingest">
                  <div className="wf-node-icon">🎙️</div>
                  <div className="wf-node-body">
                    <span className="wf-node-tag">Source</span>
                    <strong>Omi Transcript Stream</strong>
                    <small>
                      {currentRun
                        ? `Length: ${currentRun.transcript.length} chars`
                        : "Ready for incoming audio"}
                    </small>
                  </div>
                  <div className="wf-status-badge wf-badge-ok">Connected</div>
                </div>

                {/* Connecting Beam */}
                <div className={`wf-connector-line ${isRunning ? "flowing" : ""}`}>
                  <span className="wf-arrow-head">▼</span>
                </div>

                {/* Stage 2: Orchestrator Node */}
                <div className={`wf-node wf-node-orchestrator ${isRunning ? "active-glow" : ""}`}>
                  <div className="wf-node-icon">🧭</div>
                  <div className="wf-node-body">
                    <span className="wf-node-tag">Decision Router</span>
                    <strong>{REGISTERED_AGENTS.orchestrator.name}</strong>
                    <small className="mono">ID: {REGISTERED_AGENTS.orchestrator.id.slice(0, 14)}...</small>
                  </div>
                  <div className="wf-status-badge wf-badge-orange">
                    {isRunning ? "Evaluating Intent" : currentRun ? "Dispatched" : "Idle"}
                  </div>
                </div>

                {/* Branching Connectors */}
                <div className="wf-branch-container">
                  <div className="wf-branch-lines">
                    <div className={`wf-branch-line left ${activeAgentKey === "voice" ? "branch-active" : ""}`} />
                    <div className={`wf-branch-line center ${activeAgentKey === "coding" ? "branch-active" : ""}`} />
                    <div className={`wf-branch-line right ${activeAgentKey === "research" ? "branch-active" : ""}`} />
                  </div>

                  {/* 3 Sub-Agent Nodes */}
                  <div className="wf-subagents-grid">
                    {/* Voice Agent */}
                    <div
                      className={`wf-subagent-card ${
                        activeAgentKey === "voice" ? "selected-agent pulse-agent" : "dimmed-agent"
                      }`}
                    >
                      <div className="wf-subagent-header">
                        <span className="wf-subagent-icon">🎙️</span>
                        {activeAgentKey === "voice" && (
                          <span className="wf-chosen-badge">SELECTED</span>
                        )}
                      </div>
                      <strong>{REGISTERED_AGENTS.voice.name}</strong>
                      <p>{REGISTERED_AGENTS.voice.role}</p>
                      <small className="mono">{REGISTERED_AGENTS.voice.id.slice(0, 10)}...</small>
                    </div>

                    {/* Coding Agent */}
                    <div
                      className={`wf-subagent-card ${
                        activeAgentKey === "coding" ? "selected-agent pulse-agent" : "dimmed-agent"
                      }`}
                    >
                      <div className="wf-subagent-header">
                        <span className="wf-subagent-icon">💻</span>
                        {activeAgentKey === "coding" && (
                          <span className="wf-chosen-badge">SELECTED</span>
                        )}
                      </div>
                      <strong>{REGISTERED_AGENTS.coding.name}</strong>
                      <p>{REGISTERED_AGENTS.coding.role}</p>
                      <small className="mono">{REGISTERED_AGENTS.coding.id.slice(0, 10)}...</small>
                    </div>

                    {/* Research Agent */}
                    <div
                      className={`wf-subagent-card ${
                        activeAgentKey === "research" ? "selected-agent pulse-agent" : "dimmed-agent"
                      }`}
                    >
                      <div className="wf-subagent-header">
                        <span className="wf-subagent-icon">🔬</span>
                        {activeAgentKey === "research" && (
                          <span className="wf-chosen-badge">SELECTED</span>
                        )}
                      </div>
                      <strong>{REGISTERED_AGENTS.research.name}</strong>
                      <p>{REGISTERED_AGENTS.research.role}</p>
                      <small className="mono">{REGISTERED_AGENTS.research.id.slice(0, 10)}...</small>
                    </div>
                  </div>
                </div>

                {/* Connecting Line to Vector Memory */}
                <div className="wf-connector-line">
                  <span className="wf-arrow-head">▼</span>
                </div>

                {/* Stage 4: Vector Memory Node */}
                <div className="wf-node wf-node-memory">
                  <div className="wf-node-icon">🗄️</div>
                  <div className="wf-node-body">
                    <span className="wf-node-tag">Vector Database</span>
                    <strong>Qdrant & Gemini Embedding-2</strong>
                    <small>
                      {currentRun
                        ? "User prompt & Agent response vectorized & saved to Qdrant"
                        : "Embeddings: gemini-embedding-2 · Vector Storage: Qdrant"}
                    </small>
                  </div>
                  <div className="wf-status-badge wf-badge-ok">
                    {currentRun?.status === "completed" ? "Vectorized & Synced" : "Ready"}
                  </div>
                </div>

                {/* Connecting Line to Output */}
                <div className="wf-connector-line">
                  <span className="wf-arrow-head">▼</span>
                </div>

                {/* Stage 4: Output Synthesis Node */}
                <div className="wf-node wf-node-output">
                  <div className="wf-node-icon">✨</div>
                  <div className="wf-node-body">
                    <span className="wf-node-tag">Synthesis</span>
                    <strong>Workspace Output Stream</strong>
                    <small>
                      {currentRun
                        ? `Finished in ${currentRun.durationMs}ms · Delivered to Voice Room`
                        : "Awaiting execution"}
                    </small>
                  </div>
                  <div className="wf-status-badge wf-badge-ok">
                    {currentRun?.status === "completed" ? "Synthesized" : "Ready"}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: EXECUTION STEPS TIMELINE */}
            {activeTab === "steps" && (
              <div className="wf-steps-timeline">
                {!currentRun ? (
                  <div className="wf-empty-state">
                    <span>⏳</span>
                    <p>No workflow run executed yet. Click a sample preset or send a transcript above.</p>
                  </div>
                ) : (
                  currentRun.steps.map((st) => (
                    <div className={`wf-step-item ${st.status}`} key={st.step}>
                      <div className="wf-step-num">{st.step}</div>
                      <div className="wf-step-content">
                        <div className="wf-step-row">
                          <strong>{st.name}</strong>
                          <span className={`wf-step-badge ${st.status}`}>{st.badge || st.status}</span>
                          <time>{st.timestamp}</time>
                        </div>
                        <p>{st.description}</p>
                        {st.details && (
                          <div className="wf-step-details">
                            <pre>{JSON.stringify(st.details, null, 2)}</pre>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* TAB 3: OUTPUT & TRACE */}
            {activeTab === "output" && (
              <div className="wf-output-view">
                {!currentRun ? (
                  <div className="wf-empty-state">
                    <span>📝</span>
                    <p>Execute an agent workflow to view the synthesized output.</p>
                  </div>
                ) : (
                  <>
                    <div className="wf-output-card">
                      <div className="wf-output-header">
                        <div className="wf-output-agent-badge">
                          <span>{currentRun.chosenAgent?.icon || "✨"}</span>
                          <strong>{currentRun.chosenAgent?.name || "Agent"}</strong>
                        </div>
                        <button
                          type="button"
                          className="wf-copy-btn"
                          onClick={() => handleCopy(currentRun.response, "output")}
                        >
                          {copiedId === "output" ? "Copied! ✓" : "Copy Output"}
                        </button>
                      </div>
                      <div className="wf-output-body">
                        <pre className="wf-formatted-text">{currentRun.response}</pre>
                      </div>
                    </div>

                    {currentRun.rawResponse && (
                      <details className="wf-raw-details">
                        <summary>View Raw Mastra Response Envelope</summary>
                        <pre>{currentRun.rawResponse}</pre>
                      </details>
                    )}
                  </>
                )}
              </div>
            )}

            {/* TAB 4: AGENT SPECS & CURLS */}
            {activeTab === "specs" && (
              <div className="wf-specs-grid">
                {Object.values(REGISTERED_AGENTS).map((ag) => (
                  <div className="wf-spec-card" key={ag.id}>
                    <div className="wf-spec-head">
                      <span className="wf-spec-icon">{ag.icon}</span>
                      <div>
                        <strong>{ag.name}</strong>
                        <small>{ag.role}</small>
                      </div>
                      <span className={`wf-spec-pill ${ag.color}`}>{ag.badge}</span>
                    </div>

                    <div className="wf-spec-meta">
                      <div>
                        <span className="label">Agent ID:</span>
                        <code>{ag.id}</code>
                        <button
                          type="button"
                          className="wf-mini-copy"
                          onClick={() => handleCopy(ag.id, ag.id)}
                        >
                          {copiedId === ag.id ? "✓" : "Copy"}
                        </button>
                      </div>
                      <div>
                        <span className="label">Session ID:</span>
                        <code>{ag.sessionId}</code>
                        <button
                          type="button"
                          className="wf-mini-copy"
                          onClick={() => handleCopy(ag.sessionId, ag.sessionId)}
                        >
                          {copiedId === ag.sessionId ? "✓" : "Copy"}
                        </button>
                      </div>
                    </div>

                    <p className="wf-spec-desc">{ag.description}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Right Side: Active Agent Info & History */}
        <aside className="wf-sidebar-panel">
          {/* Active Run Summary Card */}
          <div className="wf-side-card">
            <div className="wf-card-title">Active Workflow Summary</div>
            {currentRun ? (
              <div className="wf-summary-body">
                <div className="wf-summary-agent">
                  <span className="wf-agent-big-icon">{currentRun.chosenAgent?.icon || "🧭"}</span>
                  <div>
                    <span className="wf-sub-label">Dispatched Agent</span>
                    <strong>{currentRun.chosenAgent?.name || "Evaluating"}</strong>
                    <small>{currentRun.chosenAgent?.role}</small>
                  </div>
                </div>

                <div className="wf-metrics-list">
                  <div className="wf-metric-row">
                    <span>Workflow ID</span>
                    <code className="mono">{currentRun.id.slice(0, 16)}</code>
                  </div>
                  <div className="wf-metric-row">
                    <span>Latency</span>
                    <strong>{currentRun.durationMs} ms</strong>
                  </div>
                  <div className="wf-metric-row">
                    <span>Status</span>
                    <span className="wf-badge-ok">Completed</span>
                  </div>
                  {currentRun.chosenAgent?.detectedVia && (
                    <div className="wf-metric-row">
                      <span>Reason</span>
                      <small>{currentRun.chosenAgent.detectedVia}</small>
                    </div>
                  )}
                </div>

                <div className="wf-transcript-preview">
                  <span className="wf-sub-label">Input Transcript:</span>
                  <p>{currentRun.transcript}</p>
                </div>
              </div>
            ) : (
              <div className="wf-idle-notice">
                <p>No active execution. Send a message to watch the Orchestrator select the specialized agent in real-time.</p>
              </div>
            )}
          </div>

          {/* Workflow Execution History */}
          <div className="wf-side-card wf-history-card">
            <div className="wf-card-title">
              <span>Workflow History</span>
              <span className="wf-count-badge">{history.length}</span>
            </div>

            <div className="wf-history-list">
              {history.length === 0 ? (
                <p className="wf-history-empty">Past workflow executions will appear here.</p>
              ) : (
                history.map((run) => (
                  <button
                    key={run.id}
                    type="button"
                    className={`wf-history-item ${run.id === currentRun?.id ? "active-item" : ""}`}
                    onClick={() => onSelectRun(run)}
                  >
                    <div className="wf-history-top">
                      <span>{run.chosenAgent?.icon || "🧭"} {run.chosenAgent?.name || "Agent"}</span>
                      <time>{run.timestamp}</time>
                    </div>
                    <p className="wf-history-text">{run.transcript}</p>
                    <div className="wf-history-footer">
                      <span className="mono">{run.durationMs}ms</span>
                      <span className={`wf-pill-mini ${run.chosenAgent?.color || "orange"}`}>
                        {run.chosenAgent?.badge || "Dispatched"}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
