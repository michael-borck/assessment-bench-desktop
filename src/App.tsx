import { useEffect, useRef, useState } from "react";
import type { SidecarStatus } from "../global";
import { BenchResults, type ExperimentResult } from "./components/BenchResults";
import { EngineStatus } from "./components/EngineStatus";
import { FirstRunModal } from "./components/FirstRunModal";
import { OllamaSetupCard } from "./components/OllamaSetupCard";

type RunState = "idle" | "running" | "done" | "failed";

export function App() {
  const [status, setStatus] = useState<SidecarStatus>({ phase: "not-started", url: "", token: "" });
  const [setupPhase, setSetupPhase] = useState("");
  const [yamlPath, setYamlPath] = useState<string | null>(null);
  const [run, setRun] = useState<RunState>("idle");
  const [progress, setProgress] = useState<string[]>([]);
  const [result, setResult] = useState<ExperimentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    window.lens.sidecarStatus().then(setStatus);
    const offStatus = window.lens.onSidecarStatus(setStatus);
    const offPhase = window.lens.onSetupPhase(setSetupPhase);
    return () => {
      offStatus();
      offPhase();
      if (poll.current) clearInterval(poll.current);
    };
  }, []);

  const ready = status.phase === "ready";
  const installing = setupPhase === "installing" || status.phase === "installing";

  async function start() {
    if (!yamlPath) return;
    setRun("running");
    setProgress([]);
    setResult(null);
    setError(null);
    const res = await window.lens.startExperiment(yamlPath);
    if (res.status !== 202) {
      setError(`could not start (HTTP ${res.status}): ${JSON.stringify(res.body)}`);
      setRun("failed");
      return;
    }
    const { id } = res.body as { id: string };
    poll.current = setInterval(async () => {
      const s = await window.lens.api("GET", `/experiments/${id}`);
      const body = s.body as { status: RunState; progress: string[]; error: string };
      setProgress(body.progress ?? []);
      if (body.status === "done") {
        clearInterval(poll.current!);
        const r = await window.lens.api("GET", `/experiments/${id}/result`);
        setResult(r.body as ExperimentResult);
        setRun("done");
      } else if (body.status === "failed") {
        clearInterval(poll.current!);
        setError(body.error || "experiment failed");
        setRun("failed");
      }
    }, 600);
  }

  const btn = { padding: "6px 12px", borderRadius: 6, border: "1px solid #bbb", cursor: "pointer" };

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 24, maxWidth: 920, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>Assessment Bench</h1>
        <EngineStatus status={status} />
      </header>

      {installing && <FirstRunModal />}

      <section style={{ marginTop: 20, display: "grid", gap: 10 }}>
        <p style={{ color: "#555", fontSize: 13, margin: 0 }}>
          Run an experiment (LLM vs signals vs hybrid arms over one cohort) and see which
          method agrees with the human marks. The bench measures; it never marks students.
        </p>
        <div>
          <button
            style={btn}
            onClick={async () =>
              setYamlPath(await window.lens.pickFile([{ name: "Experiment", extensions: ["yaml", "yml"] }]))
            }
          >
            Choose experiment…
          </button>
          <span style={{ marginLeft: 10, color: "#555", fontSize: 13 }}>
            {yamlPath ?? "no experiment selected"}
          </span>
        </div>
        <div>
          <button
            style={{ ...btn, opacity: ready && yamlPath && run !== "running" ? 1 : 0.5 }}
            disabled={!ready || !yamlPath || run === "running"}
            onClick={start}
          >
            {run === "running" ? "Running…" : "Run experiment"}
          </button>
          {!ready && (
            <span style={{ marginLeft: 10, fontSize: 13, color: "#b8860b" }}>waiting for the engine…</span>
          )}
        </div>
      </section>

      {run === "running" && (
        <pre
          style={{
            background: "#111",
            color: "#ddd",
            padding: 12,
            borderRadius: 6,
            fontSize: 12,
            maxHeight: 180,
            overflow: "auto",
          }}
        >
          {progress.join("\n") || "starting…"}
        </pre>
      )}
      {error && <p style={{ color: "#c62828" }}>Error: {error}</p>}

      {result && (
        <section style={{ marginTop: 20 }}>
          <BenchResults result={result} />
        </section>
      )}

      {!result && (
        <section style={{ marginTop: 24 }}>
          <OllamaSetupCard />
        </section>
      )}
    </main>
  );
}
