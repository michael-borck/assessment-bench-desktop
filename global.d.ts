// The preload bridge surface, as seen by the renderer.
export interface SidecarStatus {
  phase: "not-started" | "installing" | "starting" | "ready" | "unreachable" | "crashed";
  url: string;
  token: string;
}
export interface OllamaProgress {
  status: string;
  percent: number | null;
}
export interface AppConfig {
  productName: string;
  ollama: { recommendedModel: string; recommendedSizeGB: number };
}

export interface ApiResponse {
  status: number;
  body: unknown;
}

export interface LensBridge {
  config(): Promise<AppConfig>;
  sidecarStatus(): Promise<SidecarStatus>;
  onSidecarStatus(cb: (s: SidecarStatus) => void): () => void;
  onSidecarLog(cb: (line: string) => void): () => void;
  api(method: string, path: string, body?: unknown): Promise<ApiResponse>;
  pickDir(): Promise<string | null>;
  pickFile(filters?: { name: string; extensions: string[] }[]): Promise<string | null>;
  startExperiment(yamlPath: string): Promise<ApiResponse>;
  onSetupPhase(cb: (phase: string) => void): () => void;
  onSetupLog(cb: (line: string) => void): () => void;
  onSetupError(cb: (err: string) => void): () => void;
  ollamaDetect(): Promise<{ running: boolean; models: string[] }>;
  ollamaPull(model: string): Promise<void>;
  onOllamaProgress(cb: (p: OllamaProgress) => void): () => void;
}

declare global {
  interface Window {
    lens: LensBridge;
  }
}
