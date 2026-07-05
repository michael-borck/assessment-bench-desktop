/** Form-based experiment builder — the non-technical path. Composes the same
 *  config object the YAML file would hold and hands it to the engine; no YAML
 *  authoring required. Paths come from native pickers, so they are absolute. */

import { useEffect, useState } from "react";

export type ArmKind = "llm" | "signals" | "hybrid";
export type Provider = "anthropic" | "openai" | "ollama" | "openrouter" | "grok" | "gemini";

export interface ArmDraft {
  id: string;
  kind: ArmKind;
  repetitions: number;
  provider: Provider;
  model: string;
}

export interface ExperimentConfigPayload {
  name: string;
  rubric: string;
  submissions: string;
  max_score: number;
  human_marks?: string;
  arms: Array<
    | { id: string; kind: "signals" }
    | {
        id: string;
        kind: "llm" | "hybrid";
        repetitions: number;
        provider: { provider: Provider; model: string; temperature: number };
      }
  >;
}

const PROVIDERS: Provider[] = ["anthropic", "openai", "ollama", "openrouter", "grok", "gemini"];

const DEFAULT_MODELS: Record<Provider, string> = {
  anthropic: "claude-haiku-4-5",
  openai: "gpt-4o-mini",
  ollama: "llama3.2:3b",
  openrouter: "openrouter/auto",
  grok: "grok-3-mini",
  gemini: "gemini-2.5-flash",
};

const PROVIDER_LABELS: Record<Provider, string> = {
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI (GPT)",
  ollama: "Ollama (local — private)",
  openrouter: "OpenRouter",
  grok: "xAI (Grok)",
  gemini: "Google (Gemini)",
};

const KIND_HELP: Record<ArmKind, string> = {
  llm: "An LLM reads the submission + rubric and emits a mark (the baseline under test).",
  signals: "Deterministic signal observations via assessment-lens (runs once; no LLM).",
  hybrid: "LLM marking with the deterministic signals included in the prompt.",
};

let armCounter = 0;
function newArm(kind: ArmKind, provider: Provider = "anthropic"): ArmDraft {
  armCounter += 1;
  const base = kind === "signals" ? "signals" : `${kind}-${provider}`;
  return {
    id: armCounter > 3 ? `${base}-${armCounter}` : base,
    kind,
    repetitions: 3,
    provider,
    model: DEFAULT_MODELS[provider],
  };
}

const field: React.CSSProperties = { display: "grid", gap: 4 };
const labelStyle: React.CSSProperties = { fontSize: 12, color: "#555", fontWeight: 600 };
const inputStyle: React.CSSProperties = {
  padding: "5px 8px",
  borderRadius: 6,
  border: "1px solid #ccc",
  fontSize: 13,
};
const btn: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 6,
  border: "1px solid #bbb",
  cursor: "pointer",
  fontSize: 13,
};
const pathText: React.CSSProperties = { fontSize: 12, color: "#555", wordBreak: "break-all" };

function KeyHint({
  provider,
  keys,
  onSaved,
}: {
  provider: Provider;
  keys: Record<string, boolean>;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  if (provider === "ollama") {
    return <span style={{ fontSize: 12, color: "#2e7d32" }}>runs locally — no key needed</span>;
  }
  if (keys[provider]) {
    return <span style={{ fontSize: 12, color: "#2e7d32" }}>✓ API key saved</span>;
  }
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      <input
        style={{ ...inputStyle, width: 220 }}
        type="password"
        placeholder={`paste your ${PROVIDER_LABELS[provider]} API key`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
      <button
        style={{ ...btn, opacity: draft.trim() && !saving ? 1 : 0.5 }}
        disabled={!draft.trim() || saving}
        onClick={async () => {
          setSaving(true);
          try {
            await window.lens.keysSave(provider, draft);
            setDraft("");
            onSaved();
          } finally {
            setSaving(false);
          }
        }}
      >
        {saving ? "Saving…" : "Save key"}
      </button>
    </span>
  );
}

export function ExperimentBuilder({
  ready,
  running,
  onRun,
}: {
  ready: boolean;
  running: boolean;
  onRun: (config: ExperimentConfigPayload) => void;
}) {
  const [name, setName] = useState("My experiment");
  const [rubric, setRubric] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<string | null>(null);
  const [marks, setMarks] = useState<string | null>(null);
  const [maxScore, setMaxScore] = useState(100);
  const [arms, setArms] = useState<ArmDraft[]>([
    newArm("llm"),
    newArm("signals"),
    newArm("hybrid"),
  ]);
  const [keys, setKeys] = useState<Record<string, boolean>>({});
  const refreshKeys = () => void window.lens.keysStatus().then(setKeys);
  useEffect(refreshKeys, []);

  function patchArm(i: number, patch: Partial<ArmDraft>) {
    setArms((prev) =>
      prev.map((a, j) => {
        if (j !== i) return a;
        const next = { ...a, ...patch };
        // Switching provider refreshes the model default (unless user edited it away).
        if (patch.provider && (a.model === DEFAULT_MODELS[a.provider] || !a.model)) {
          next.model = DEFAULT_MODELS[patch.provider];
        }
        return next;
      }),
    );
  }

  const problems: string[] = [];
  if (!rubric) problems.push("choose a rubric file");
  if (!submissions) problems.push("choose the submissions folder");
  if (arms.length === 0) problems.push("add at least one arm");
  const ids = arms.map((a) => a.id.trim());
  if (new Set(ids).size !== ids.length) problems.push("arm names must be unique");
  if (arms.some((a) => a.kind !== "signals" && !a.model.trim()))
    problems.push("every LLM/hybrid arm needs a model");
  const missingKeys = [
    ...new Set(
      arms
        .filter((a) => a.kind !== "signals" && a.provider !== "ollama" && !keys[a.provider])
        .map((a) => PROVIDER_LABELS[a.provider]),
    ),
  ];
  if (missingKeys.length) problems.push(`save an API key for ${missingKeys.join(", ")}`);

  function buildConfig(): ExperimentConfigPayload {
    return {
      name: name.trim() || "My experiment",
      rubric: rubric!,
      submissions: submissions!,
      max_score: maxScore,
      ...(marks ? { human_marks: marks } : {}),
      arms: arms.map((a) =>
        a.kind === "signals"
          ? { id: a.id.trim(), kind: "signals" as const }
          : {
              id: a.id.trim(),
              kind: a.kind,
              repetitions: a.repetitions,
              provider: { provider: a.provider, model: a.model.trim(), temperature: 0.1 },
            },
      ),
    };
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
        <div style={field}>
          <label style={labelStyle}>Experiment name</label>
          <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div style={field}>
          <label style={labelStyle}>Marks are out of</label>
          <input
            style={inputStyle}
            type="number"
            min={1}
            value={maxScore}
            onChange={(e) => setMaxScore(Number(e.target.value) || 100)}
          />
        </div>
      </div>

      <div style={field}>
        <label style={labelStyle}>Rubric (assessment-lens YAML)</label>
        <div>
          <button
            style={btn}
            onClick={async () =>
              setRubric(
                await window.lens.pickFile([
                  { name: "Rubric", extensions: ["yaml", "yml", "json"] },
                ]),
              )
            }
          >
            Choose rubric…
          </button>
          <span style={{ ...pathText, marginLeft: 8 }}>{rubric ?? "none chosen"}</span>
        </div>
      </div>

      <div style={field}>
        <label style={labelStyle}>Submissions folder (one subfolder per student)</label>
        <div>
          <button style={btn} onClick={async () => setSubmissions(await window.lens.pickDir())}>
            Choose folder…
          </button>
          <span style={{ ...pathText, marginLeft: 8 }}>{submissions ?? "none chosen"}</span>
        </div>
      </div>

      <div style={field}>
        <label style={labelStyle}>
          Your marks (optional CSV: submission_id,mark) — enables agreement statistics
        </label>
        <div>
          <button
            style={btn}
            onClick={async () =>
              setMarks(await window.lens.pickFile([{ name: "Marks CSV", extensions: ["csv"] }]))
            }
          >
            Choose CSV…
          </button>
          {marks && (
            <button style={{ ...btn, marginLeft: 6 }} onClick={() => setMarks(null)}>
              Clear
            </button>
          )}
          <span style={{ ...pathText, marginLeft: 8 }}>{marks ?? "none (no agreement stats)"}</span>
        </div>
      </div>

      <div style={field}>
        <label style={labelStyle}>Methods to compare (arms)</label>
        {arms.map((arm, i) => (
          <div
            key={i}
            style={{
              border: "1px solid #e0e0e0",
              borderRadius: 8,
              padding: 10,
              display: "grid",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input
                style={{ ...inputStyle, width: 130 }}
                value={arm.id}
                title="Arm name (appears in results)"
                onChange={(e) => patchArm(i, { id: e.target.value })}
              />
              <select
                style={inputStyle}
                value={arm.kind}
                onChange={(e) => patchArm(i, { kind: e.target.value as ArmKind })}
              >
                <option value="llm">LLM marking</option>
                <option value="signals">Signal observations</option>
                <option value="hybrid">Hybrid (LLM + signals)</option>
              </select>
              {arm.kind !== "signals" && (
                <>
                  <select
                    style={inputStyle}
                    value={arm.provider}
                    onChange={(e) => patchArm(i, { provider: e.target.value as Provider })}
                  >
                    {PROVIDERS.map((p) => (
                      <option key={p} value={p}>
                        {PROVIDER_LABELS[p]}
                      </option>
                    ))}
                  </select>
                  <input
                    style={{ ...inputStyle, width: 170 }}
                    value={arm.model}
                    title="Model name"
                    onChange={(e) => patchArm(i, { model: e.target.value })}
                  />
                  <label style={{ fontSize: 12, color: "#555" }}>
                    runs:{" "}
                    <input
                      style={{ ...inputStyle, width: 55 }}
                      type="number"
                      min={1}
                      max={50}
                      value={arm.repetitions}
                      onChange={(e) =>
                        patchArm(i, {
                          repetitions: Math.max(1, Math.min(50, Number(e.target.value) || 1)),
                        })
                      }
                    />
                  </label>
                </>
              )}
              <button
                style={{ ...btn, marginLeft: "auto", color: "#c62828" }}
                title="Remove this arm"
                onClick={() => setArms((prev) => prev.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            </div>
            <div style={{ fontSize: 12, color: "#777" }}>{KIND_HELP[arm.kind]}</div>
            {arm.kind !== "signals" && (
              <KeyHint provider={arm.provider} keys={keys} onSaved={refreshKeys} />
            )}
          </div>
        ))}
        <div>
          <button style={btn} onClick={() => setArms((prev) => [...prev, newArm("llm")])}>
            + Add arm
          </button>
        </div>
      </div>

      <div>
        <button
          style={{
            ...btn,
            fontWeight: 600,
            opacity: ready && !running && problems.length === 0 ? 1 : 0.5,
          }}
          disabled={!ready || running || problems.length > 0}
          onClick={() => onRun(buildConfig())}
        >
          {running ? "Running…" : "Run experiment"}
        </button>
        {problems.length > 0 && (
          <span style={{ marginLeft: 10, fontSize: 12, color: "#b8860b" }}>
            To run: {problems.join("; ")}.
          </span>
        )}
      </div>
    </div>
  );
}
