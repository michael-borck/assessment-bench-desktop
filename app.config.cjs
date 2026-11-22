// The ONE place an app made from this template customises itself.
// Required by both electron-builder.config.js (build) and the main process
// (runtime), so the two never drift.

// One local model, referenced everywhere it matters (Ollama pull + the default
// ollama arm in the experiment builder) so the model the app pulls is the model
// a local arm uses. Tiers verified against ollama.com/library/qwen3.5 (2026-09)
// — bump IDs as the catalogue evolves.
const OLLAMA_MODELS = {
  small: { id: "qwen3.5:2b", label: "Qwen3.5 · 2B", sizeGB: 1.6, note: "lighter — fine on 8–16 GB machines" },
  large: { id: "qwen3.5:4b", label: "Qwen3.5 · 4B", sizeGB: 2.9, note: "better prose — needs ~16 GB" },
};
const LOCAL_MODEL = OLLAMA_MODELS.small.id;

module.exports = {
  // Identity
  appId: "com.michaelborck.assessmentbench",
  productName: "Assessment Bench",

  // --- Python sidecar (the app's `serve` HTTP API) ---------------------------
  // pip specs installed into the app-local venv on first run. The bench's
  // signals/hybrid arms compose assessment-lens, which shells out to
  // bundle-analyser → auto-analyser → the specialists, so the whole stack must
  // be installed here or nothing routes. (assessment-bench[analysers] pulls in
  // bundle-analyser; the specialists are listed explicitly so their file types
  // actually analyse.) [embeddings] extras power text-space distinctiveness.
  // Pin per app release; bump deliberately with the app.
  sidecarPipSpecs: [
    "assessment-bench[serve,analysers,llm]==0.5.1",
    "auto-analyser>=0.8.0", // the router bundle-analyser shells out to (0.8: multi-cascade + heuristics)
    "bundle-analyser>=0.6.0", // cascade promotion needs 0.6
    "document-analyser[embeddings]", // reports, essays (the universal deliverable)
    "code-analyser[embeddings]",
    "conversation-analyser[embeddings]", // AI-chat transcripts
    "reflection-analyser[embeddings]", // reflective journals
    "provenance-analyser", // document metadata: creator app, editing time, revisions
    // Broader submission coverage — auto-analyser routes by extension, so an
    // analyser must be installed here for its file types to produce signals.
    // Heavy first-run (the installer pins CPU-only torch); speech/whisper models
    // download once on first transcription:
    "speech-analyser", // audio: mp3/wav/m4a/ogg/flac/aac/opus
    "video-analyser>=0.13.0", // video: mp4/mov/avi/webm/mkv (needs 0.13.0's contract --json mode)
    "image-analyser", // images: png/jpg/gif/bmp/tiff/webp (also transitively via video)
    "records-analyser", // spreadsheets + data: xlsx/csv/tsv/json/yaml/xml
    "diagram-analyser", // diagrams: mmd/mermaid/puml/plantuml/dot/gv/drawio
  ],
  // Console script the installed package exposes; {PORT}/{HOST} are substituted,
  // resolved against the venv's bin/ dir. (e.g. `assessment-bench serve ...`)
  serveCommand: "assessment-bench serve --port {PORT} --host {HOST}",
  // Health endpoint + default port (the sidecar manager probes this).
  healthPath: "/health",
  defaultPort: 8020,
  // The env var the engine reads its bearer token from — the family standard is
  // {PREFIX}_AUTH_TOKEN (lens-contract add_auth). Main generates the token per
  // session and keeps it out of the renderer.
  authTokenEnv: "ASSESSMENT_BENCH_AUTH_TOKEN",

  // --- Models (fully-offline) ------------------------------------------------
  // Either drop files in resources/models/ (bundled in the installer), or list
  // them here for first-run download with SHA-256 verification. dest is relative
  // to the app-local models dir.
  models: [
    // { url: "https://…/model.bin", sha256: "…", dest: "whisper/ggml-tiny.bin" },
  ],

  // --- Local LLM (Ollama) ----------------------------------------------------
  ollama: {
    models: OLLAMA_MODELS, // curated tiers, offered by machine size
    defaultModel: LOCAL_MODEL, // default for a new ollama arm in the builder
  },
};