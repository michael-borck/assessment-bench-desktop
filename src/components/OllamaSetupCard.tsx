import { useEffect, useState } from "react";
import type { AppConfig, OllamaModelTier } from "../../global";

/**
 * Local AI setup — three phases, each opt-in:
 *   1. Ollama not running → one-off in-app install (per-OS) with progress, or
 *      the manual route (ollama.com) for those who prefer it.
 *   2. Running but no curated model → pick a tier sized for the machine
 *      (2B default on ≤16 GB, 4B on 16 GB+), pulled in-app with progress.
 *   3. Ready → shows which model local arms default to.
 * The bench is fully usable without any of this (local arms just stay off).
 */

type Phase =
  | { kind: "checking" }
  | { kind: "not-running" }
  | { kind: "installing"; status: string; percent: number | null }
  | { kind: "choose" }
  | { kind: "pulling"; tier: string; status: string; percent: number | null }
  | { kind: "ready"; models: string[] }
  | { kind: "error"; message: string };

const box: React.CSSProperties = {
  border: "1px solid #e0e0e0",
  borderRadius: 10,
  padding: 16,
  display: "grid",
  gap: 8,
};
const btn: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 6,
  border: "1px solid #bbb",
  cursor: "pointer",
  fontSize: 13,
};
const barOuter: React.CSSProperties = {
  height: 6,
  borderRadius: 3,
  background: "#eee",
  overflow: "hidden",
};
const barFill = (pct: number): React.CSSProperties => ({
  display: "block",
  height: "100%",
  width: `${Math.min(100, Math.max(2, pct))}%`,
  background: "#4c8bf5",
  transition: "width 200ms",
});
const tierRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  border: "1px solid #eee",
  borderRadius: 8,
  padding: 10,
};

function tierFor(models: Record<string, OllamaModelTier>, id: string): OllamaModelTier | null {
  return Object.values(models).find((m) => m.id === id) ?? null;
}

export function OllamaSetupCard() {
  const [phase, setPhase] = useState<Phase>({ kind: "checking" });
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  const [busy, setBusy] = useState(false);

  const check = async (c?: AppConfig) => {
    const conf = c ?? cfg;
    setPhase({ kind: "checking" });
    const s = await window.lens.ollamaDetect();
    if (!s.running) setPhase({ kind: "not-running" });
    else if (!conf) return; // config not loaded yet; the [cfg] effect re-runs
    else if (Object.values(conf.ollama.models).some((m) => s.models.includes(m.id)))
      setPhase({ kind: "ready", models: s.models });
    else setPhase({ kind: "choose" });
  };

  useEffect(() => {
    window.lens.config().then((c) => {
      setCfg(c);
      void check(c); // evaluate with the fresh config
    });
    const offPull = window.lens.onOllamaProgress((p) =>
      setPhase((prev) =>
        prev.kind === "pulling"
          ? { ...prev, status: p.status, percent: p.percent }
          : prev,
      ),
    );
    const offInstall = window.lens.onOllamaInstallProgress((p) =>
      setPhase((prev) =>
        prev.kind === "installing"
          ? { ...prev, status: p.status, percent: p.percent }
          : prev,
      ),
    );
    return () => {
      offPull();
      offInstall();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const install = async () => {
    setBusy(true);
    setPhase({ kind: "installing", status: "starting…", percent: 0 });
    const r = await window.lens.ollamaInstall();
    setBusy(false);
    if (!r.ok) {
      setPhase({ kind: "error", message: r.error ?? "install failed" });
      return;
    }
    await check();
  };

  const pullTier = async (tier: OllamaModelTier) => {
    setBusy(true);
    setPhase({ kind: "pulling", tier: tier.id, status: "starting…", percent: 0 });
    try {
      await window.lens.ollamaPull(tier.id);
      await window.lens.setOllamaModel(tier.id);
      setBusy(false);
      await check();
    } catch (e) {
      setBusy(false);
      setPhase({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  if (!cfg || phase.kind === "checking") {
    return <div style={box}>Checking for a local AI (Ollama)…</div>;
  }

  const models = cfg.ollama.models;
  const tiers = Object.values(models);
  const recommended = models[cfg.system.recommendedTier] ?? tiers[0];

  if (phase.kind === "ready") {
    const chosen = tierFor(models, cfg.settings.ollamaModel ?? cfg.ollama.defaultModel);
    return (
      <div style={box}>
        ✅ Local AI ready{chosen ? ` — local arms default to ${chosen.label}` : ""} (private, on
        this machine).
      </div>
    );
  }

  if (phase.kind === "installing") {
    return (
      <div style={box}>
        <strong>Installing Ollama…</strong>
        <span style={{ color: "#555", fontSize: 12 }}>{phase.status}</span>
        <div style={barOuter}>
          <span style={barFill(phase.percent ?? 5)} />
        </div>
      </div>
    );
  }

  if (phase.kind === "pulling") {
    return (
      <div style={box}>
        <strong>Downloading {phase.tier}…</strong>
        <span style={{ color: "#555", fontSize: 12 }}>{phase.status}</span>
        <div style={barOuter}>
          <span style={barFill(phase.percent ?? 5)} />
        </div>
      </div>
    );
  }

  if (phase.kind === "choose") {
    return (
      <div style={box}>
        <strong>Local AI (optional, private, on this machine)</strong>
        <p style={{ margin: 0, color: "#555", fontSize: 13 }}>
          Pick a model sized for this machine ({cfg.system.totalMemGB} GB RAM) for local
          (Ollama) arms. You can skip entirely.
        </p>
        {tiers.map((t) => (
          <div style={tierRow} key={t.id}>
            <div>
              <strong>{t.label}</strong>{" "}
              {t.id === recommended.id && (
                <span
                  style={{
                    fontSize: 11,
                    color: "#2e7d32",
                    border: "1px solid #c8e6c9",
                    borderRadius: 10,
                    padding: "1px 8px",
                  }}
                >
                  recommended
                </span>
              )}
              <div style={{ color: "#777", fontSize: 12 }}>
                {t.note} · ~{t.sizeGB} GB download
              </div>
            </div>
            <button style={{ ...btn, cursor: busy ? "wait" : "pointer" }} disabled={busy} onClick={() => void pullTier(t)}>
              Download
            </button>
          </div>
        ))}
      </div>
    );
  }

  if (phase.kind === "error") {
    return (
      <div style={{ ...box, borderColor: "#ef9a9a" }}>
        <span style={{ color: "#c62828" }}>{phase.message}</span>
        <div>
          <button style={btn} onClick={() => void check()}>
            Check again
          </button>
        </div>
      </div>
    );
  }

  // not-running
  return (
    <div style={box}>
      <strong>Local AI (optional, private, on this machine)</strong>
      <p style={{ margin: 0, color: "#555", fontSize: 13 }}>
        One-off install (~1 GB). Any LLM arm set to Ollama runs on this computer; nothing
        leaves it.
      </p>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button style={btn} disabled={busy} onClick={() => void install()}>
          {busy ? "Installing…" : "Install Ollama now"}
        </button>
        <a href="https://ollama.com/download" target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>
          or install manually
        </a>
        <button style={btn} onClick={() => void check()}>
          I&apos;ve installed it — check again
        </button>
      </div>
    </div>
  );
}