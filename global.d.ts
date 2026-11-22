// The preload bridge surface, as seen by the renderer.
export interface SidecarStatus {
  phase: "not-started" | "installing" | "starting" | "ready" | "unreachable" | "crashed";
  url: string;
}
export interface OllamaProgress {
  status: string;
  percent: number | null;
}
export interface OllamaModelTier {
  id: string;
  label: string;
  sizeGB: number;
  note: string;
}
export interface AppConfig {
  productName: string;
  ollama: { models: Record<string, OllamaModelTier>; defaultModel: string };
  system: {
    platform: NodeJS.Platform;
    totalMemGB: number;
    recommendedTier: "small" | "large";
  };
  settings: { ollamaModel?: string; heuristics?: boolean };
}

export interface ApiResponse {
  status: number;
  body: unknown;
}

export interface LensBridge {
  config(): Promise<AppConfig>;
  sidecarStatus(): Promise<SidecarStatus>;
  restartEngine(): Promise<boolean>;
  onSidecarStatus(cb: (s: SidecarStatus) => void): () => void;
  onSidecarLog(cb: (line: string) => void): () => void;
  api(method: string, path: string, body?: unknown): Promise<ApiResponse>;
  pickDir(): Promise<string | null>;
  pickFile(filters?: { name: string; extensions: string[] }[]): Promise<string | null>;
  startExperiment(yamlPath: string): Promise<ApiResponse>;
  startExperimentConfig(config: unknown): Promise<ApiResponse>;
  keysStatus(): Promise<Record<string, boolean>>;
  keysSave(provider: string, key: string): Promise<boolean>;
  onSetupPhase(cb: (phase: string) => void): () => void;
  onSetupLog(cb: (line: string) => void): () => void;
  onSetupError(cb: (err: string) => void): () => void;
  ollamaDetect(): Promise<{ running: boolean; models: string[] }>;
  ollamaPull(model: string): Promise<void>;
  onOllamaProgress(cb: (p: OllamaProgress) => void): () => void;
  ollamaInstall(): Promise<{ ok: boolean; error?: string }>;
  onOllamaInstallProgress(cb: (p: OllamaProgress) => void): () => void;
  setOllamaModel(modelId: string): Promise<boolean>;
  setHeuristics(enabled: boolean): Promise<boolean>;
}

declare global {
  interface Window {
    lens: LensBridge;
  }
}
