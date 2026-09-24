"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type User = { id: string; name: string; email: string; initials: string; color: string };
type VoiceEntry = { id: number; speaker: string; text: string; time: string; kind: "user" | "assistant" };
type AgentActivity = { id: number; agent: string; text: string; time: string };

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

const USER_KEY = "workspace-chat-user";
const VOICE_KEY = "workspace-voice-session";
const SEEN_KEY = "workspace-omi-seen";
const AGENT_ACTIVITY_KEY = "workspace-agent-activity";
const POLL_INTERVAL_MS = 10000;

const AGENT_AGENTS: { name: string; initials: string; color: string; role: string }[] = [
  { name: "Omi Orchestrator", initials: "OM", color: "orange", role: "Routes every transcript" },
  { name: "Chat agent", initials: "CH", color: "purple", role: "Explains and discusses" },
  { name: "Research agent", initials: "RE", color: "blue", role: "Verifies and investigates" },
  { name: "Coding agent", initials: "CO", color: "mint", role: "Writes and fixes code" },
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
  return <span className={`avatar avatar-${color}`}>{initials}{online && <span className="presence" />}</span>;
}

function Icon({ children }: { children: string }) {
  return <span className="icon" aria-hidden="true">{children}</span>;
}

const DEFAULT_VOICE_ENTRIES: VoiceEntry[] = [
  { id: 1, speaker: "Local assistant", text: "Ready to capture your next voice update.", time: "Now", kind: "assistant" },
];

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [syncMessage, setSyncMessage] = useState("Tap the button and speak with your Omi device.");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [voiceEntries, setVoiceEntries] = useState<VoiceEntry[]>(() => {
    if (typeof window === "undefined") {
      return DEFAULT_VOICE_ENTRIES;
    }

    try {
      const saved = window.localStorage.getItem(VOICE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as VoiceEntry[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      // ignore invalid stored data and fall back below
    }

    return DEFAULT_VOICE_ENTRIES;
  });

  const [agentActivities, setAgentActivities] = useState<AgentActivity[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }

    try {
      const saved = window.localStorage.getItem(AGENT_ACTIVITY_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as AgentActivity[];
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch {
      // ignore invalid stored data and fall back to empty
    }

    return [];
  });

  const seenRef = useRef<Set<string> | null>(null);

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
    if (typeof window === "undefined" || !user) return;
    window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  }, [user]);

  const addVoiceEntry = useCallback((speaker: string, text: string, kind: "user" | "assistant") => {
    const nextEntry: VoiceEntry = {
      id: Date.now() + Math.random(),
      speaker,
      text,
      time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
      kind,
    };

    setVoiceEntries((current) => [nextEntry, ...current].slice(0, 6));
  }, []);

  const addAgentActivity = useCallback((agent: string, text: string) => {
    const nextEntry: AgentActivity = {
      id: Date.now() + Math.random(),
      agent,
      text,
      time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
    };

    setAgentActivities((current) => [nextEntry, ...current].slice(0, 20));
  }, []);

  const orchestrateWithLyzr = useCallback(async (conversation: OmiConversation) => {
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

    try {
      const response = await fetch("/api/lyzr/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: conversation.id, transcriptText: lines.join("\n") }),
      });
      if (!response.ok) {
        const detail = (await response.json().catch(() => null)) as { error?: string } | null;
        return detail?.error ?? `Lyzr responded with ${response.status}.`;
      }
      const data = (await response.json()) as { agent?: string | null; response?: string };
      if (data.response) {
        const speaker = data.agent || "Lyzr orchestrator";
        addVoiceEntry(speaker, data.response, "assistant");
        addAgentActivity(speaker, data.response);
        return null;
      }
      return "Lyzr returned no response.";
    } catch {
      return "Could not reach Lyzr.";
    }
  }, [addVoiceEntry, addAgentActivity]);

  const syncFromOmi = useCallback(async () => {
    try {
      const response = await fetch("/api/omi/conversations?limit=5&include_transcript=true");
      if (!response.ok) {
        setSyncMessage("Omi sync failed — check your API key and try again.");
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

        const error = await orchestrateWithLyzr(conversation);
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
        setSyncMessage(`Synced ${fresh.length} new conversation${fresh.length === 1 ? "" : "s"} at ${now}. Lyzr: ${orchestrated} ok, ${failed} failed.`);
      } else {
        setSyncMessage(`Synced ${fresh.length} new conversation${fresh.length === 1 ? "" : "s"} and sent to Lyzr at ${now}.`);
      }
    } catch {
      setSyncMessage("Could not reach Omi right now.");
    }
  }, [addVoiceEntry, orchestrateWithLyzr]);

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
      setSyncMessage("Omi is listening. Press again to stop and transcribe.");
      return;
    }

    setSyncMessage("Recording stopped. Transcribing with Omi...");
    window.setTimeout(() => {
      void syncFromOmi();
    }, 300);
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
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"><Icon>▰</Icon></span>
          <strong>Workspace</strong>
        </div>

        <nav className="primary-nav" aria-label="Primary navigation">
          <button className="nav-item selected" type="button"><Icon>◉</Icon>Voice Room</button>
          <button className="nav-item" type="button"><Icon>◌</Icon>To-dos</button>
          <button className="nav-item" type="button"><Icon>✦</Icon>Notes</button>
          <button className="nav-item" type="button"><Icon>✓</Icon>Recent Calls</button>
        </nav>

        <div className="agents-nav" aria-label="Agents">
          <div className="agents-title">Agents</div>
          {AGENT_AGENTS.map((agent) => {
            const active = lastActiveAt[agent.name];
            const runs = runCounts[agent.name] ?? 0;
            return (
              <div className="agent-item" key={agent.name}>
                <Avatar initials={agent.initials} color={agent.color} online={Boolean(active)} />
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

      <section className="voice-panel">
        <header className="voice-header">
          <div className="voice-title">
            <span className="voice-icon"><Icon>◉</Icon></span>
            <div>
              <h1>Voice room</h1>
              <p><span className="connection-dot connected" />Omi{lastSyncedAt ? ` · ${lastSyncedAt}` : ""}</p>
            </div>
          </div>
          <div className="header-actions">
            <button className="share-button" type="button" aria-label="Call status"><Icon>◍</Icon></button>
          </div>
        </header>

        <div className="voice-stage">
          <div className="voice-card">
            <span className={`live-indicator ${isListening ? "active" : ""}`}>
              {isListening ? "Listening" : "Ready"}
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
                ? "Omi is actively listening. Click again to stop and transcribe."
                : "Tap to start recording with Omi."}
            </p>
          </div>

          <div className="voice-transcript">
            <div className="transcript-header">
              <span>Live transcript</span>
              {isListening && (
                <button type="button" onClick={toggleListening}>Stop</button>
              )}
            </div>

            <div className="transcript-body">
              <div className="transcript-user">
                <Avatar initials={user.initials} color={user.color} />
                <strong>{user.name}</strong>
              </div>
              <p>{syncMessage}</p>
            </div>
          </div>
        </div>

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

        <div className="voice-activity agent-activity">
          <div className="activity-header">
            <h2>Agent activity</h2>
            <span>{agentActivities.length} runs</span>
          </div>

          {agentActivities.length === 0 ? (
            <p className="activity-empty">
              Orchestrated agent runs will show up here as Omi conversations are processed.
            </p>
          ) : (
            agentActivities.map((entry) => (
              <article className="voice-entry assistant" key={entry.id}>
                <div className="entry-avatar">{entry.agent.charAt(0)}</div>
                <div className="entry-copy">
                  <div className="entry-meta">
                    <strong>{entry.agent}</strong>
                    <time>{entry.time}</time>
                  </div>
                  <p>{entry.text}</p>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <aside className="assistant-panel">
        <div className="assistant-card">
          <div className="assistant-avatar">AI</div>
          <div>
            <small>Assistant</small>
            <strong>Local voice AI</strong>
          </div>
        </div>

        <div className="assistant-summary">
          <small>Suggested action</small>
          <p>{assistantSummary}</p>
        </div>

        <div className="assistant-actions">
          <button type="button" onClick={toggleListening}>
            {isListening ? "Stop Recording" : "Record"}
          </button>
          <button type="button">Notes</button>
        </div>
      </aside>
    </main>
  );
}