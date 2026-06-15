import { useEffect, useState } from "react";
import type { AppConfig } from "../../global";

/**
 * Ollama setup — probe → guide install → pull the curated model with progress →
 * ready. We never auto-install Ollama (insight-lens/career-compass pattern): the
 * user installs it from ollama.com, then we re-probe.
 */
type Phase =
  | { kind: "checking" }
  | { kind: "not-running" }
  | { kind: "no-model" }
  | { kind: "pulling"; status: string; percent: number | null }
  | { kind: "ready"; models: string[] }
  | { kind: "error"; message: string };

export function OllamaSetupCard() {
  const [phase, setPhase] = useState<Phase>({ kind: "checking" });
  const [cfg, setCfg] = useState<AppConfig["ollama"] | null>(null);

  const check = async () => {
    setPhase({ kind: "checking" });
    const s = await window.lens.ollamaDetect();
    if (!s.running) setPhase({ kind: "not-running" });
    else if (s.models.length === 0) setPhase({ kind: "no-model" });
    else setPhase({ kind: "ready", models: s.models });
  };

  useEffect(() => {
    window.lens.config().then((c) => setCfg(c.ollama));
    void check();
    return window.lens.onOllamaProgress((p) =>
      setPhase({ kind: "pulling", status: p.status, percent: p.percent }),
    );
  }, []);

  const pull = async () => {
    if (!cfg) return;
    setPhase({ kind: "pulling", status: "starting…", percent: null });
    try {
      await window.lens.ollamaPull(cfg.recommendedModel);
      await check();
    } catch (e) {
      setPhase({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  const box = { border: "1px solid #e0e0e0", borderRadius: 10, padding: 16 };

  if (phase.kind === "ready") {
    return (
      <div style={box}>
        ✅ Local AI ready — {phase.models.length} model(s) on this machine.
      </div>
    );
  }
  if (phase.kind === "checking") return <div style={box}>Checking for a local AI (Ollama)…</div>;

  return (
    <div style={box}>
      <strong>Local AI (private, on this machine)</strong>
      {phase.kind === "not-running" && (
        <p>
          Narration uses a local model so nothing leaves your computer. Install
          Ollama, then re-check.{" "}
          <a href="https://ollama.com/download" target="_blank" rel="noreferrer">
            Get Ollama (free)
          </a>
          <br />
          <button onClick={check}>I've installed it — check again</button>
        </p>
      )}
      {phase.kind === "no-model" && cfg && (
        <p>
          Ollama is running but has no model.{" "}
          <button onClick={pull}>
            Download {cfg.recommendedModel} · {cfg.recommendedSizeGB} GB
          </button>
        </p>
      )}
      {phase.kind === "pulling" && (
        <p>
          Downloading… {phase.status} {phase.percent != null ? `${phase.percent}%` : ""}
        </p>
      )}
      {phase.kind === "error" && (
        <p style={{ color: "#c62828" }}>
          {phase.message} <button onClick={pull}>Retry</button>
        </p>
      )}
    </div>
  );
}
