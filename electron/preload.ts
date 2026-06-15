/**
 * Preload bridge — the only surface the renderer sees. contextIsolation is on;
 * nothing from node leaks except these explicit channels.
 */
import { contextBridge, ipcRenderer } from "electron";

type Cb<T> = (payload: T) => void;
function on<T>(channel: string, cb: Cb<T>): () => void {
  const handler = (_e: unknown, payload: T) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld("lens", {
  // App
  config: () => ipcRenderer.invoke("app:config"),

  // Sidecar (the engine)
  sidecarStatus: () => ipcRenderer.invoke("sidecar:status"),
  onSidecarStatus: (cb: Cb<{ phase: string; url: string; token: string }>) =>
    on("sidecar:status", cb),
  onSidecarLog: (cb: Cb<string>) => on("sidecar:log", cb),
  // Proxied JSON call to the sidecar HTTP API (main holds the token).
  api: (method: string, path: string, body?: unknown) =>
    ipcRenderer.invoke("sidecar:request", method, path, body),

  // Native file/folder pickers
  pickDir: () => ipcRenderer.invoke("dialog:pickDir"),
  pickFile: (filters?: { name: string; extensions: string[] }[]) =>
    ipcRenderer.invoke("dialog:pickFile", filters),

  // Bench: start an experiment from a YAML config path (resolved in main).
  startExperiment: (yamlPath: string) => ipcRenderer.invoke("experiment:start", yamlPath),

  // First-run setup
  onSetupPhase: (cb: Cb<string>) => on("setup:phase", cb),
  onSetupLog: (cb: Cb<string>) => on("setup:log", cb),
  onSetupError: (cb: Cb<string>) => on("setup:error", cb),

  // Ollama (local LLM)
  ollamaDetect: () => ipcRenderer.invoke("ollama:detect"),
  ollamaPull: (model: string) => ipcRenderer.invoke("ollama:pull", model),
  onOllamaProgress: (cb: Cb<{ status: string; percent: number | null }>) =>
    on("ollama:progress", cb),
});
