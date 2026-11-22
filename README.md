# Assessment Bench (desktop)

Compare assessment **methods** on a cohort — pure-LLM marking vs the family's
signal-based observations vs a hybrid — and see which agrees with the human marks.
**The bench measures; it never marks students.**

**Private by design.** The experiment runs in a local engine; any LLM arm can use
a **local model (Ollama)**, so student work and marks never leave the machine.

> Built from the [`lens-desktop`](https://github.com/michael-borck/lens-desktop)
> template. Wraps [`assessment-bench`](https://github.com/michael-borck/assessment-bench)'s
> `serve` HTTP API as a bundled Python sidecar.

## Use it

1. Author an experiment YAML (a rubric, a cohort folder, optional `human_marks`
   CSV, and the arms to compare — `assessment-bench init` writes an example).
2. Launch the app, **Choose experiment…**, **Run**.
3. Watch progress; see agreement (Pearson/Spearman vs human marks) per arm and
   per signal, plus each arm's repeatability.

First launch installs the local engine (one-time, with progress); afterwards it
works offline. For local LLM arms, the app can install [Ollama](https://ollama.com/download)
for you (one click) and pull a model sized for the machine — or you can install it
manually and re-check.

## How it works

```
Electron UI ─IPC─ main ─┬─ writes auto-analyser.yaml (local CLI routing) beside the sidecar
                        ├─ reads + resolves the experiment YAML, POSTs to ↓
                        ├─ the assessment-bench `serve` sidecar (local venv)
                        └─ installs/detects Ollama for local LLM arms
```

The signals and hybrid arms compose `assessment-lens` → `bundle-analyser` →
`auto-analyser`, so `main` writes a routing config that points every bundled
specialist at its local CLI (the analysers' defaults are localhost HTTP services).
`app.config.cjs` is the one place this app configures itself.

## Develop

```bash
npm install
npm run dev
npm run package
npm test          # UI unit tests (vitest)
```

## Status

**v0.3 — engine shell aligned with the family.** Local auto-analyser routing,
tiered Ollama install, settings, and a vitest suite; typecheck + electron-vite
build pass.
Full first-run install + live GUI run need per-OS verification. First-run installs
`assessment-bench[serve,analysers,llm]==0.5.1` plus the specialist analysers from
PyPI; the sidecar is token-gated per session (`ASSESSMENT_BENCH_AUTH_TOKEN`, held
in main).
