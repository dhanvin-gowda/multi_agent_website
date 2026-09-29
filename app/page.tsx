"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { WorkflowView, WorkflowRun } from "./components/WorkflowView";

type User = { id: string; name: string; email: string; initials: string; color: string };
type VoiceEntry = { id: number; speaker: string; text: string; time: string; kind: "user" | "assistant" };
type AgentActivity = { id: number; agent: string; text: string; time: string; agentColor?: string; latency?: number };

type OmiTranscriptSegment = {
  id?: string | null;
  text: string;
  speaker_id?: number | null;
  speaker_name?: string | null;
  start: number;
  end: number;
};

type OmiConversation = {
  id: string;
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  title?: string;
  overview?: string;
  structured?: {
    title?: string;
    overview?: string;
    action_items?: Array<{ description?: string }>;
  };
  transcript_segments?: OmiTranscriptSegment[] | null;
};

type SpeechRecognitionResultEventLike = Event & {
  resultIndex: number;
  results: SpeechRecognitionResultList;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

const USER_KEY = "workspace-chat-user";
const VOICE_KEY = "workspace-voice-session";
const SEEN_KEY = "workspace-omi-seen";
const AGENT_ACTIVITY_KEY = "workspace-agent-activity";
const WORKFLOW_HISTORY_KEY = "workspace-lyzr-workflow-history";
const POLL_INTERVAL_MS = 10000;

const AGENT_AGENTS = [
  {
    name: "Omi Orchestrator",
    initials: "OM",
    color: "orange",
    role: "Routes every transcript",
    id: "6ab55e4654c80e95195e7cd5",
    icon: "🧭",
  },
  {
    name: "Voice Agent",
    initials: "VO",
    color: "purple",
    role: "Conversational voice AI",
    id: "6ab55e3f01d4f5fcb2df0d36",
    icon: "🎙️",
  },
  {
    name: "Coding Agent",
    initials: "CO",
    color: "mint",
    role: "GitHub Issues & Code",
    id: "6ab55e4301d4f5fcb2df0d38",
    icon: "💻",
  },
  {
    name: "Research Agent",
    initials: "RE",
    color: "blue",
    role: "Verifies & analyzes facts",
    id: "6ab55e4272a639bfb70537e3",
    icon: "🔬",
  },
];

function createInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function getUserColor(name: string) {
  const palette = ["orange", "mint", "purple", "blue", "coral", "gold"];
  const index = Array.from(name).reduce((total, character) => total + character.charCodeAt(0), 0) % palette.length;
  return palette[index];
}

function buildUser(name: string): User {
  const cleanName = name.trim() || "Guest";
  const email = `${cleanName.toLowerCase().replace(/\s+/g, ".")}@local.workspace`;
  return {
    id: `${email}-${Date.now()}`,
    name: cleanName,
    email,
    initials: createInitials(cleanName),
    color: getUserColor(cleanName),
  };
}

function Avatar({ initials, color, online = false }: { initials: string; color: string; online?: boolean }) {
  return (
    <span className={`avatar avatar-${color}`}>
      {initials}
      {online && <span className="presence" />}
    </span>
  );
}

function Icon({ children }: { children: string }) {
  return (
    <span className="icon" aria-hidden="true">
      {children}
    </span>
  );
}

const DEFAULT_VOICE_ENTRIES: VoiceEntry[] = [
  { id: 1, speaker: "Local assistant", text: "Ready to capture your next voice update.", time: "Now", kind: "assistant" },
];

export default function Home() {
  const [activeNav, setActiveNav] = useState<"voice" | "workflow">("voice");
  const [user, setUser] = useState<User | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [syncMessage, setSyncMessage] = useState("Tap mic to speak or sync transcript with Omi.");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [isOrchestrating, setIsOrchestrating] = useState(false);

  // Workflow State
  const [currentWorkflowRun, setCurrentWorkflowRun] = useState<WorkflowRun | null>(null);
  const [workflowHistory, setWorkflowHistory] = useState<WorkflowRun[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = window.localStorage.getItem(WORKFLOW_HISTORY_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as WorkflowRun[];
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore
    }
    return [];
  });

  const [voiceEntries, setVoiceEntries] = useState<VoiceEntry[]>(() => {
    if (typeof window === "undefined") return DEFAULT_VOICE_ENTRIES;
    try {
      const saved = window.localStorage.getItem(VOICE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as VoiceEntry[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return DEFAULT_VOICE_ENTRIES;
  });

  const [agentActivities, setAgentActivities] = useState<AgentActivity[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = window.localStorage.getItem(AGENT_ACTIVITY_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as AgentActivity[];
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore
    }
    return [];
  });

  const seenRef = useRef<Set<string> | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const shouldRecognizeRef = useRef(false);
  const finalTranscriptRef = useRef("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const savedUser = window.localStorage.getItem(USER_KEY);
      const parsedUser = savedUser ? (JSON.parse(savedUser) as User) : null;
      queueMicrotask(() => {
        if (parsedUser?.name) {
          setUser(parsedUser);
        } else {
          const guestUser = buildUser("Guest");
          window.localStorage.setItem(USER_KEY, JSON.stringify(guestUser));
          setUser(guestUser);
        }
      });
    } catch {
      window.localStorage.removeItem(USER_KEY);
      queueMicrotask(() => setUser(buildUser("Guest")));
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (seenRef.current) return;
    try {
      const saved = window.localStorage.getItem(SEEN_KEY);
      const parsed = saved ? (JSON.parse(saved) as string[]) : [];
      seenRef.current = new Set(Array.isArray(parsed) ? parsed : []);
    } catch {
      seenRef.current = new Set();
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(VOICE_KEY, JSON.stringify(voiceEntries));
  }, [voiceEntries]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(AGENT_ACTIVITY_KEY, JSON.stringify(agentActivities));
  }, [agentActivities]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(WORKFLOW_HISTORY_KEY, JSON.stringify(workflowHistory.slice(0, 30)));
  }, [workflowHistory]);

  useEffect(() => {
    if (typeof window === "undefined" || !user) return;
    window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  }, [user]);

  useEffect(() => {
    return () => {
      shouldRecognizeRef.current = false;
      recognitionRef.current?.stop();
    };
  }, []);

  const addVoiceEntry = useCallback((speaker: string, text: string, kind: "user" | "assistant") => {
    const nextEntry: VoiceEntry = {
      id: Date.now() + Math.random(),
      speaker,
      text,
      time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
      kind,
    };
    setVoiceEntries((current) => [nextEntry, ...current].slice(0, 10));
  }, []);

  const addAgentActivity = useCallback((agent: string, text: string, latency?: number, color?: string) => {
    const nextEntry: AgentActivity = {
      id: Date.now() + Math.random(),
      agent,
      text,
      time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
      latency,
      agentColor: color,
    };
    setAgentActivities((current) => [nextEntry, ...current].slice(0, 20));
  }, []);

  // Main orchestration caller
  const dispatchToOrchestrator = useCallback(
    async (transcriptText: string, conversationId?: string) => {
      setIsOrchestrating(true);
      const startTime = Date.now();
      const cid = conversationId || `direct-${Date.now()}`;

      try {
        const response = await fetch("/api/mastra/orchestrate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId: cid, transcriptText }),
        });

        const data = await response.json();
        const duration = Date.now() - startTime;

        if (!response.ok || !data.success) {
          const errMsg = data.error || "Orchestration failed.";
          addVoiceEntry("Omi Orchestrator", `Error: ${errMsg}`, "assistant");
          return errMsg;
        }

        const chosen = data.chosenAgent;
        const speaker = chosen?.name || data.agent || "Mastra Orchestrator";
        const replyText = data.response;

        // Add to voice entries and activities
        addVoiceEntry(speaker, replyText, "assistant");
        addAgentActivity(speaker, replyText, data.workflow?.durationMs || duration, chosen?.color);

        // Store workflow run
        const run: WorkflowRun = {
          id: data.workflow.id,
          conversationId: data.workflow.conversationId,
          timestamp: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
          transcript: transcriptText,
          durationMs: data.workflow.durationMs || duration,
          status: "completed",
          chosenAgent: chosen,
          orchestrator: data.orchestrator,
          steps: data.workflow.steps,
          response: replyText,
          rawResponse: data.rawResponse,
        };

        setCurrentWorkflowRun(run);
        setWorkflowHistory((prev) => [run, ...prev.filter((r) => r.id !== run.id)]);
        setSyncMessage(`Orchestrator selected: ${chosen.name} (${run.durationMs}ms)`);
        return null;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Could not reach Mastra.";
        addVoiceEntry("Omi Orchestrator", `Network error: ${msg}`, "assistant");
        return msg;
      } finally {
        setIsOrchestrating(false);
      }
    },
    [addVoiceEntry, addAgentActivity],
  );

  const orchestrateWithMastra = useCallback(
    async (conversation: OmiConversation) => {
      const title = conversation.structured?.title ?? conversation.title ?? "New Omi conversation";
      const overview = conversation.structured?.overview ?? conversation.overview;
      const segments = conversation.transcript_segments ?? [];

      const lines: string[] = [title];
      if (overview) {
        lines.push(`Summary: ${overview}`);
      }
      lines.push("Transcript:");
      for (const segment of segments) {
        const speaker = segment.speaker_name?.trim() || `Speaker ${(segment.speaker_id ?? 0) + 1}`;
        lines.push(`[${speaker}]: ${segment.text}`);
      }

      return dispatchToOrchestrator(lines.join("\n"), conversation.id);
    },
    [dispatchToOrchestrator],
  );

  const syncFromOmi = useCallback(async () => {
    try {
      const response = await fetch("/api/omi/conversations?limit=5&include_transcript=true");
      if (!response.ok) {
        setSyncMessage("Omi sync failed — check your API key.");
        return;
      }

      const conversations = (await response.json()) as OmiConversation[];
      const sorted = [...conversations].sort((a, b) => {
        const at = a.started_at ?? a.created_at ?? "";
        const bt = b.started_at ?? b.created_at ?? "";
        return bt.localeCompare(at);
      });

      const now = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      const fresh = sorted.filter((conversation) => !seenRef.current?.has(conversation.id));

      let orchestrated = 0;
      let failed = 0;

      for (const conversation of fresh) {
        seenRef.current ??= new Set();
        seenRef.current.add(conversation.id);

        const title = conversation.structured?.title ?? conversation.title ?? "New Omi conversation";
        const overview = conversation.structured?.overview ?? conversation.overview;
        addVoiceEntry("Omi assistant", overview || title, "assistant");

        const segments = conversation.transcript_segments ?? [];
        for (const segment of segments) {
          const speaker = segment.speaker_name?.trim() || `Speaker ${(segment.speaker_id ?? 0) + 1}`;
          addVoiceEntry(speaker, segment.text, "user");
        }

        const error = await orchestrateWithMastra(conversation);
        if (error) {
          failed += 1;
        } else {
          orchestrated += 1;
        }
      }

      if (fresh.length > 0) {
        const seen = seenRef.current ?? new Set<string>();
        seenRef.current = seen;
        window.localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(seen)));
      }

      setLastSyncedAt(now);
      if (fresh.length === 0) {
        setSyncMessage(`No new conversations at ${now}.`);
      } else if (failed > 0) {
        setSyncMessage(`Synced ${fresh.length} conversation(s) at ${now}. Mastra: ${orchestrated} ok, ${failed} failed.`);
      } else {
        setSyncMessage(`Synced ${fresh.length} conversation(s) ➔ Dispatched to Orchestrator at ${now}.`);
      }
    } catch {
      setSyncMessage("Could not reach Omi right now.");
    }
  }, [addVoiceEntry, orchestrateWithMastra]);

  useEffect(() => {
    if (typeof window === "undefined" || !isListening) return;

    const interval = window.setInterval(() => {
      syncFromOmi();
    }, POLL_INTERVAL_MS);

    window.setTimeout(() => {
      syncFromOmi();
    }, 0);

    return () => window.clearInterval(interval);
  }, [isListening, syncFromOmi]);

  function toggleListening() {
    const nextState = !isListening;
    setIsListening(nextState);

    if (nextState) {
      const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
      if (!Recognition) {
        setSyncMessage("Live transcription is not supported in this browser. Omi will sync after you stop.");
        return;
      }

      const recognition = new Recognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = navigator.language || "en-US";
      shouldRecognizeRef.current = true;
      recognition.onresult = (event) => {
        let interimTranscript = "";
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          if (result.isFinal) {
            finalTranscriptRef.current += ` ${result[0].transcript}`;
          } else {
            interimTranscript += result[0].transcript;
          }
        }
        setLiveTranscript(`${finalTranscriptRef.current} ${interimTranscript}`.trim());
        setSyncMessage("Live transcript updating as you speak...");
      };
      recognition.onerror = (event) => {
        if (event.error !== "aborted") {
          setSyncMessage(`Live transcription error: ${event.error}. Omi sync continues.`);
        }
      };
      recognition.onend = () => {
        if (shouldRecognizeRef.current) {
          recognition.start();
        }
      };
      recognitionRef.current = recognition;
      recognition.start();
      finalTranscriptRef.current = "";
      setLiveTranscript("");
      setSyncMessage("Omi is listening. Transcript appears while you speak.");
      return;
    }

    shouldRecognizeRef.current = false;
    recognitionRef.current?.stop();
    recognitionRef.current = null;

    const captured = finalTranscriptRef.current.trim();
    if (captured) {
      addVoiceEntry(user?.name || "User", captured, "user");
      setSyncMessage("Recording stopped. Sending transcript to Orchestrator...");
      void dispatchToOrchestrator(captured);
    } else {
      setSyncMessage("Recording stopped. Transcribing with Omi...");
      window.setTimeout(() => {
        void syncFromOmi();
      }, 300);
    }
  }

  if (!user) return null;

  const assistantSummary = voiceEntries.find((entry) => entry.kind === "assistant")?.text ?? "Ready for your next update.";

  const lastActiveAt: Record<string, string> = {};
  const runCounts: Record<string, number> = {};
  for (const entry of agentActivities) {
    if (!lastActiveAt[entry.agent]) {
      lastActiveAt[entry.agent] = entry.time;
    }
    runCounts[entry.agent] = (runCounts[entry.agent] ?? 0) + 1;
  }

  return (
    <main className="workspace-shell">
      {/* Left Sidebar */}
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Icon>▰</Icon>
          </span>
          <strong>Workspace</strong>
        </div>

        <nav className="primary-nav" aria-label="Primary navigation">
          <button
            className={`nav-item ${activeNav === "voice" ? "selected" : ""}`}
            type="button"
            onClick={() => setActiveNav("voice")}
          >
            <Icon>◉</Icon>Voice Room
          </button>
          <button
            className={`nav-item ${activeNav === "workflow" ? "selected" : ""}`}
            type="button"
            onClick={() => setActiveNav("workflow")}
          >
            <Icon>🧭</Icon>Workflow Studio
            {isOrchestrating && <span className="wf-pulse-dot" style={{ marginLeft: "auto" }} />}
          </button>
          <Link href="/orchestator" className="nav-item" style={{ textDecoration: "none" }}>
            <Icon>✦</Icon>Full Screen Pipeline ↗
          </Link>
        </nav>

        {/* Multi-Agent Registry in Sidebar */}
        <div className="agents-nav" aria-label="Agents">
          <div className="agents-title">Mastra Agents ({AGENT_AGENTS.length})</div>
          {AGENT_AGENTS.map((agent) => {
            const active = lastActiveAt[agent.name];
            const runs = runCounts[agent.name] ?? 0;
            const isCurrentlySelected = currentWorkflowRun?.chosenAgent?.id === agent.id;
            return (
              <div
                className={`agent-item ${isCurrentlySelected ? "agent-highlight" : ""}`}
                key={agent.id}
                onClick={() => setActiveNav("workflow")}
                style={{ cursor: "pointer" }}
                title={`Click to view workflow specs for ${agent.name}`}
              >
                <Avatar initials={agent.initials} color={agent.color} online={Boolean(active || isCurrentlySelected)} />
                <div className="agent-copy">
                  <strong>{agent.name}</strong>
                  <small>{active ? `Active ${active}` : agent.role}</small>
                </div>
                {runs > 0 && <span className="agent-count">{runs}</span>}
              </div>
            );
          })}
        </div>

        <div className="profile">
          <Avatar initials={user.initials} color={user.color} online />
          <div>
            <strong>{user.name}</strong>
            <small>Ready to speak</small>
          </div>
          <button
            className="signout-button"
            type="button"
            onClick={() => {
              const nextUser = buildUser("Guest");
              window.localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
              setUser(nextUser);
            }}
            aria-label="Reset user"
          >
            ↗
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      {activeNav === "workflow" ? (
        <section className="voice-panel" style={{ overflowY: "auto" }}>
          <WorkflowView
            currentRun={currentWorkflowRun}
            history={workflowHistory}
            isRunning={isOrchestrating}
            onExecute={(text) => dispatchToOrchestrator(text)}
            onSelectRun={(run) => setCurrentWorkflowRun(run)}
            onSyncOmi={syncFromOmi}
          />
        </section>
      ) : (
        <section className="voice-panel">
          <header className="voice-header">
            <div className="voice-title">
              <span className="voice-icon">
                <Icon>◉</Icon>
              </span>
              <div>
                <h1>Voice room</h1>
                <p>
                  <span className="connection-dot connected" />
                  Omi Wearable{lastSyncedAt ? ` · Last synced ${lastSyncedAt}` : ""}
                </p>
              </div>
            </div>
            <div className="header-actions">
              <button
                className="wf-sync-btn"
                type="button"
                onClick={() => syncFromOmi()}
                disabled={isOrchestrating}
                style={{ marginRight: 8 }}
              >
                <span className="wf-pulse-dot" />
                Sync Omi
              </button>
              <button
                className="share-button"
                type="button"
                onClick={() => setActiveNav("workflow")}
                title="View Full Workflow Pipeline"
              >
                <Icon>🧭</Icon>
              </button>
            </div>
          </header>

          {/* Live Orchestrator Workflow Pipeline Banner */}
          {currentWorkflowRun && (
            <div
              style={{
                margin: "16px 28px 0",
                background: "#ffffff",
                border: "1px solid var(--line)",
                borderRadius: 14,
                padding: "12px 18px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                boxShadow: "0 2px 10px rgba(0,0,0,0.03)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <span style={{ fontSize: 20 }}>🧭</span>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#8c90a1", textTransform: "uppercase" }}>
                      Workflow Route
                    </span>
                    <span
                      className={`wf-pill-mini ${currentWorkflowRun.chosenAgent?.color || "orange"}`}
                    >
                      {currentWorkflowRun.chosenAgent?.name || "Dispatched"}
                    </span>
                    <span style={{ fontSize: 11, color: "#9da1b1" }}>
                      ({currentWorkflowRun.durationMs}ms)
                    </span>
                  </div>
                  <p style={{ margin: "2px 0 0", fontSize: 12, color: "#444754" }}>
                    <strong>Omi Transcript</strong> ➔ <strong>Orchestrator</strong> ➔{" "}
                    <span style={{ color: "var(--orange)", fontWeight: 700 }}>
                      {currentWorkflowRun.chosenAgent?.name}
                    </span>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveNav("workflow")}
                style={{
                  background: "#fff3ea",
                  color: "var(--orange)",
                  border: "1px solid #ffd9bf",
                  borderRadius: 8,
                  padding: "6px 12px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Open Workflow Visualizer ➔
              </button>
            </div>
          )}

          {/* Voice Stage */}
          <div className="voice-stage">
            <div className="voice-card">
              <span className={`live-indicator ${isListening ? "active" : ""}`}>
                {isListening ? "Listening with Omi" : "Ready"}
              </span>

              <button
                className={`mic-button ${isListening ? "active" : ""}`}
                type="button"
                aria-label={isListening ? "Stop recording" : "Start recording with Omi"}
                onClick={toggleListening}
              >
                <span className="mic-core">◉</span>
              </button>

              <div className={`wave-bars ${isListening ? "active" : ""}`} aria-hidden="true">
                {[0, 1, 2, 3, 4, 5, 6, 7].map((bar) => (
                  <span key={bar} className={`wave-bar wave-${bar + 1}`} />
                ))}
              </div>

              <p className="voice-status">
                {isListening
                  ? "Omi is actively listening. Speak and click again to route to Orchestrator."
                  : "Tap to record or speak with your Omi device."}
              </p>
            </div>

            <div className="voice-transcript">
              <div className="transcript-header">
                <span>Live transcript</span>
                {isListening && (
                  <button type="button" onClick={toggleListening}>
                    Stop
                  </button>
                )}
              </div>

              <div className="transcript-body">
                <div className="transcript-user">
                  <Avatar initials={user.initials} color={user.color} />
                  <strong>{user.name}</strong>
                </div>
                <p>{liveTranscript || syncMessage}</p>
              </div>
            </div>
          </div>

          {/* Quick Dispatch Presets */}
          <div style={{ margin: "0 28px 14px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#8c90a1" }}>
              Quick Test:
            </span>
            <button
              type="button"
              className="wf-sample-chip wf-chip-mint"
              disabled={isOrchestrating}
              onClick={() =>
                dispatchToOrchestrator(
                  "Create an issue in repository dhanvin-gowda/multi_agent_website titled 'Fix responsive navbar toggle' describing that the mobile menu overlay does not close on selection.",
                )
              }
            >
              <span>🐙 Create GitHub Issue</span>
              <small>➔ Coding Agent</small>
            </button>
            <button
              type="button"
              className="wf-sample-chip wf-chip-mint"
              disabled={isOrchestrating}
              onClick={() =>
                dispatchToOrchestrator(
                  "Check repository dhanvin-gowda/multi_agent_website and solve the issue with responsive navbar menu overlay with code fix.",
                )
              }
            >
              <span>🛠️ Solve GitHub Issue</span>
              <small>➔ Coding Agent</small>
            </button>
            <button
              type="button"
              className="wf-sample-chip wf-chip-mint"
              disabled={isOrchestrating}
              onClick={() =>
                dispatchToOrchestrator(
                  "Write a Python function to parse JSON with error handling and logging.",
                )
              }
            >
              <span>💻 Coding Query</span>
              <small>➔ Coding Agent</small>
            </button>
            <button
              type="button"
              className="wf-sample-chip wf-chip-blue"
              disabled={isOrchestrating}
              onClick={() =>
                dispatchToOrchestrator(
                  "What are the latest findings regarding quantum computing qubits fidelity in 2024?",
                )
              }
            >
              <span>🔬 Research Query</span>
              <small>➔ Research Agent</small>
            </button>
            <button
              type="button"
              className="wf-sample-chip wf-chip-purple"
              disabled={isOrchestrating}
              onClick={() =>
                dispatchToOrchestrator(
                  "Can you chat with me about why AI is exciting?",
                )
              }
            >
              <span>🎙️ Voice Chat</span>
              <small>➔ Voice Agent</small>
            </button>
          </div>

          {/* Voice Notes History */}
          <div className="voice-activity">
            <div className="activity-header">
              <h2>Voice notes</h2>
              <span>{voiceEntries.length} saved</span>
            </div>

            {voiceEntries.map((entry) => (
              <article className={`voice-entry ${entry.kind}`} key={entry.id}>
                <div className="entry-avatar">{entry.kind === "user" ? user.initials : "AI"}</div>
                <div className="entry-copy">
                  <div className="entry-meta">
                    <strong>{entry.speaker}</strong>
                    <time>{entry.time}</time>
                  </div>
                  <p>{entry.text}</p>
                </div>
              </article>
            ))}
          </div>

          {/* Agent Activity History */}
          <div className="voice-activity agent-activity">
            <div className="activity-header">
              <h2>Agent activity & workflow runs</h2>
              <span>{agentActivities.length} runs</span>
            </div>

            {agentActivities.length === 0 ? (
              <p className="activity-empty">
                Orchestrated agent runs will show up here as Omi transcripts are processed.
              </p>
            ) : (
              agentActivities.map((entry) => (
                <article className="voice-entry assistant" key={entry.id}>
                  <div className="entry-avatar">{entry.agent.charAt(0)}</div>
                  <div className="entry-copy">
                    <div className="entry-meta">
                      <strong>{entry.agent}</strong>
                      {entry.latency && (
                        <span style={{ fontSize: 10, color: "#10ba7a", fontWeight: 700, marginLeft: 6 }}>
                          {entry.latency}ms
                        </span>
                      )}
                      <time>{entry.time}</time>
                    </div>
                    <p>{entry.text}</p>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      )}

      {/* Right Assistant Panel */}
      <aside className="assistant-panel">
        <div className="assistant-card">
          <div className="assistant-avatar">AI</div>
          <div>
            <small>Mastra Multi-Agent</small>
            <strong>{currentWorkflowRun?.chosenAgent?.name || "Omi Orchestrator"}</strong>
          </div>
        </div>

        <div className="assistant-summary">
          <small>Latest Output / Suggestion</small>
          <p>{assistantSummary}</p>
        </div>

        <div className="assistant-actions">
          <button type="button" onClick={toggleListening}>
            {isListening ? "Stop Recording" : "Record"}
          </button>
          <button type="button" onClick={() => setActiveNav(activeNav === "voice" ? "workflow" : "voice")}>
            {activeNav === "voice" ? "Workflow View" : "Voice Room"}
          </button>
        </div>
      </aside>
    </main>
  );
}