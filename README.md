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
works offline. For local LLM arms, install [Ollama](https://ollama.com/download).

## How it works

```
Electron UI ─IPC─ main ─┬─ reads + resolves the experiment YAML, POSTs to ↓
                        ├─ the assessment-bench `serve` sidecar (local venv)
                        └─ detects Ollama for local LLM arms
```

`app.config.cjs` is the one place this app configures itself.

## Develop

```bash
npm install
npm run dev
npm run package
```

## Status

Scaffolded from the template and **verified to build** (typecheck + electron-vite).
Full first-run install + live GUI run need per-OS verification. First-run installs
`assessment-bench` from PyPI (0.4.0 is published).
