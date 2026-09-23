"use client";

import { useEffect, useRef, useState } from "react";

type User = { id: string; name: string; email: string; initials: string; color: string };
type VoiceEntry = { id: number; speaker: string; text: string; time: string; kind: "user" | "assistant" };

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: any) => void) | null;
  onresult: ((event: any) => void) | null;
};

const USER_KEY = "workspace-chat-user";
const VOICE_KEY = "workspace-voice-session";

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

declare global {
  interface Window {
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    SpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("Press the microphone to start speaking.");
  const [voiceEntries, setVoiceEntries] = useState<VoiceEntry[]>(() => {
    if (typeof window === "undefined") {
      return [{ id: 1, speaker: "Local assistant", text: "Ready to capture your next voice update.", time: "Now", kind: "assistant" }];
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

    return [{ id: 1, speaker: "Local assistant", text: "Ready to capture your next voice update.", time: "Now", kind: "assistant" }];
  });

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const savedUser = window.localStorage.getItem(USER_KEY);
      if (savedUser) {
        const parsedUser = JSON.parse(savedUser) as User;
        if (parsedUser?.name) {
          setUser(parsedUser);
          return;
        }
      }
    } catch {
      window.localStorage.removeItem(USER_KEY);
    }

    const guestUser = buildUser("Guest");
    window.localStorage.setItem(USER_KEY, JSON.stringify(guestUser));
    setUser(guestUser);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(VOICE_KEY, JSON.stringify(voiceEntries));
  }, [voiceEntries]);

  useEffect(() => {
    if (typeof window === "undefined" || !user) return;
    window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  }, [user]);

  useEffect(() => () => {
    recognitionRef.current?.stop();
  }, []);

  function addVoiceEntry(speaker: string, text: string, kind: "user" | "assistant") {
    const nextEntry: VoiceEntry = {
      id: Date.now(),
      speaker,
      text,
      time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
      kind,
    };

    setVoiceEntries((current) => [nextEntry, ...current].slice(0, 6));
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setIsListening(false);
  }

  function startListening() {
    if (typeof window === "undefined") return;

    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      setLiveTranscript("Voice recognition is not supported in this browser.");
      return;
    }

    if (!recognitionRef.current) {
      const recognition: SpeechRecognitionLike = new SpeechRecognitionCtor();
      recognition.lang = "en-US";
      recognition.interimResults = true;
      recognition.continuous = true;

      recognition.onstart = () => setIsListening(true);
      recognition.onresult = (event: any) => {
        let interimText = "";
        let finalText = "";

        for (let index = 0; index < event.results.length; index += 1) {
          const result = event.results[index];
          const line = result[0]?.transcript ?? "";

          if (result.isFinal) {
            finalText += `${line} `;
          } else {
            interimText += `${line} `;
          }
        }

        const nextText = finalText.trim() || interimText.trim() || "Listening...";
        setLiveTranscript(nextText);

        if (finalText.trim()) {
          addVoiceEntry(user?.name ?? "Guest", finalText.trim(), "user");
          setLiveTranscript(finalText.trim());
        }
      };

      recognition.onerror = (event: any) => {
        const message = event?.error === "not-allowed"
          ? "Microphone permission was blocked."
          : "The microphone is unavailable right now.";
        setLiveTranscript(message);
        setIsListening(false);
      };

      recognition.onend = () => setIsListening(false);
      recognitionRef.current = recognition;
    }

    try {
      if (isListening) {
        stopListening();
        return;
      }

      recognitionRef.current.start();
    } catch {
      setLiveTranscript("Microphone is already active. Try again in a moment.");
      setIsListening(false);
    }
  }

  if (!user) return null;

  const assistantSummary = voiceEntries.find((entry) => entry.kind === "assistant")?.text ?? "Ready for your next update.";

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
              <p><span className="connection-dot connected" />Local workspace</p>
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
              aria-label={isListening ? "Stop listening" : "Start listening"}
              onClick={startListening}
            >
              <span className="mic-core">◉</span>
            </button>

            <div className={`wave-bars ${isListening ? "active" : ""}`} aria-hidden="true">
              {[0, 1, 2, 3, 4, 5, 6, 7].map((bar) => (
                <span key={bar} className={`wave-bar wave-${bar + 1}`} />
              ))}
            </div>

            <p className="voice-status">
              {isListening ? "Your mic is live and listening." : "Tap the mic and speak."}
            </p>
          </div>

          <div className="voice-transcript">
            <div className="transcript-header">
              <span>Live transcript</span>
              <button type="button" onClick={stopListening}>Stop</button>
            </div>

            <div className="transcript-body">
              <div className="transcript-user">
                <Avatar initials={user.initials} color={user.color} />
                <strong>{user.name}</strong>
              </div>
              <p>{liveTranscript}</p>
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
          <button type="button">Record</button>
          <button type="button">Notes</button>
        </div>
      </aside>
    </main>
  );
}
