/**
 * Ollama integration — detect, list, and pull a local model with streaming
 * progress. Adapted from insight-lens / career-compass: we never auto-install
 * Ollama (OS-specific, fragile) — the UI links to ollama.com/download and
 * re-probes. Pulls are restricted to the curated model from app.config.
 */
import http from "node:http";

const OLLAMA = "http://127.0.0.1:11434";

export interface OllamaStatus {
  running: boolean;
  models: string[];
}

function get(path: string, timeoutMs: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = http.request(`${OLLAMA}${path}`, { timeout: timeoutMs }, (res) => {
      let buf = "";
      res.on("data", (c) => (buf += c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(buf));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.end();
  });
}

export async function detect(): Promise<OllamaStatus> {
  try {
    const data = (await get("/api/tags", 1500)) as { models?: { name: string }[] };
    return { running: true, models: (data.models ?? []).map((m) => m.name) };
  } catch {
    return { running: false, models: [] };
  }
}

export interface PullProgress {
  status: string;
  percent: number | null;
}

/** Pull `model`, streaming NDJSON progress to `onProgress`. Resolves on success. */
export function pull(
  model: string,
  curatedModel: string,
  onProgress: (p: PullProgress) => void,
): Promise<void> {
  if (model !== curatedModel) {
    return Promise.reject(new Error(`refusing to pull non-curated model: ${model}`));
  }
  return new Promise((resolve, reject) => {
    const req = http.request(
      `${OLLAMA}/api/pull`,
      { method: "POST", headers: { "Content-Type": "application/json" } },
      (res) => {
        let buf = "";
        res.on("data", (chunk) => {
          buf += chunk.toString();
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const ev = JSON.parse(line) as {
                status?: string;
                total?: number;
                completed?: number;
                error?: string;
              };
              if (ev.error) return reject(new Error(ev.error));
              onProgress({
                status: ev.status ?? "",
                percent:
                  ev.total && ev.completed != null
                    ? Math.round((ev.completed / ev.total) * 100)
                    : null,
              });
            } catch {
              /* ignore partial line */
            }
          }
        });
        res.on("end", resolve);
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.write(JSON.stringify({ name: model, stream: true }));
    req.end();
  });
}
