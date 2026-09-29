"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { WorkflowView, WorkflowRun } from "../components/WorkflowView";

const STORAGE_KEY = "workspace-lyzr-workflow-history";

export default function OrchestratorPage() {
  const [currentRun, setCurrentRun] = useState<WorkflowRun | null>(null);
  const [history, setHistory] = useState<WorkflowRun[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as WorkflowRun[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setHistory(parsed);
          setCurrentRun(parsed[0]);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const saveHistory = useCallback((runs: WorkflowRun[]) => {
    setHistory(runs);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(runs.slice(0, 30)));
    } catch {
      // ignore
    }
  }, []);

  const handleExecute = async (transcriptText: string) => {
    setIsRunning(true);
    const tempRunId = `wf-run-${Date.now()}`;
    const startTime = Date.now();

    // Create optimistic run
    const optimisticRun: WorkflowRun = {
      id: tempRunId,
      conversationId: `conv-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
      transcript: transcriptText,
      durationMs: 0,
      status: "running",
      chosenAgent: {
        id: "evaluating",
        name: "Evaluating Intent...",
        role: "Analyzing transcript...",
        icon: "🧭",
        color: "orange",
        badge: "Evaluating",
        sessionId: "",
      },
      orchestrator: {
        id: "6ab55e4654c80e95195e7cd5",
        name: "Omi Orchestrator",
        sessionId: "6ab55e4654c80e95195e7cd5-w1fbkwqc",
      },
      steps: [
        {
          step: 1,
          id: "ingest",
          name: "Omi Audio & Transcript Ingestion",
          status: "completed",
          timestamp: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" }),
          description: "Transcript forwarded to Orchestrator.",
        },
        {
          step: 2,
          id: "orchestrator",
          name: "Orchestrator Routing Decision",
          status: "in_progress",
          timestamp: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" }),
          description: "Orchestrator analyzing transcript to choose agent.",
        },
      ],
      response: "Awaiting execution...",
    };

    setCurrentRun(optimisticRun);

    try {
      const res = await fetch("/api/mastra/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcriptText }),
      });

      const data = await res.json();
      const elapsed = Date.now() - startTime;

      if (!res.ok || !data.success) {
        const failedRun: WorkflowRun = {
          ...optimisticRun,
          status: "failed",
          durationMs: elapsed,
          response: data.error || "Failed to orchestrate",
          error: data.error,
        };
        setCurrentRun(failedRun);
        saveHistory([failedRun, ...history]);
        return;
      }

      const completedRun: WorkflowRun = {
        id: data.workflow.id,
        conversationId: data.workflow.conversationId,
        timestamp: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
        transcript: transcriptText,
        durationMs: data.workflow.durationMs || elapsed,
        status: "completed",
        chosenAgent: data.chosenAgent,
        orchestrator: data.orchestrator,
        steps: data.workflow.steps,
        response: data.response,
        rawResponse: data.rawResponse,
      };

      setCurrentRun(completedRun);
      saveHistory([completedRun, ...history.filter((h) => h.id !== tempRunId)]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error";
      const failedRun: WorkflowRun = {
        ...optimisticRun,
        status: "failed",
        durationMs: Date.now() - startTime,
        response: msg,
        error: msg,
      };
      setCurrentRun(failedRun);
      saveHistory([failedRun, ...history]);
    } finally {
      setIsRunning(false);
    }
  };

  const handleSyncOmi = async () => {
    try {
      const res = await fetch("/api/omi/conversations?limit=3&include_transcript=true");
      if (!res.ok) return;
      const convs = await res.json();
      if (Array.isArray(convs) && convs.length > 0) {
        const latest = convs[0];
        const title = latest.structured?.title ?? latest.title ?? "Omi Conversation";
        const segments = latest.transcript_segments ?? [];
        const lines = [title];
        for (const seg of segments) {
          lines.push(`[${seg.speaker_name || "Speaker"}]: ${seg.text}`);
        }
        const fullTranscript = lines.join("\n");
        await handleExecute(fullTranscript);
      }
    } catch {
      // ignore
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f5f6f9" }}>
      {/* Top Navbar */}
      <nav
        style={{
          height: 64,
          background: "#fff",
          borderBottom: "1px solid #ececf2",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 28px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link
            href="/"
            style={{
              textDecoration: "none",
              color: "#20212a",
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontWeight: 700,
              fontSize: 16,
            }}
          >
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: "var(--orange)",
                color: "#fff",
                display: "grid",
                placeItems: "center",
                fontSize: 14,
              }}
            >
              ▰
            </span>
            Workspace
          </Link>
          <span style={{ color: "#8c90a1" }}>/</span>
          <span style={{ fontWeight: 600, color: "var(--orange)", fontSize: 14 }}>
            Orchestrator Workflow Studio
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link
            href="/"
            style={{
              textDecoration: "none",
              background: "#f4f5f9",
              color: "#3b4054",
              padding: "8px 14px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            ← Back to Voice Room
          </Link>
        </div>
      </nav>

      {/* Main Workflow View */}
      <main>
        <WorkflowView
          currentRun={currentRun}
          history={history}
          isRunning={isRunning}
          onExecute={handleExecute}
          onSelectRun={(run) => setCurrentRun(run)}
          onSyncOmi={handleSyncOmi}
        />
      </main>
    </div>
  );
}
