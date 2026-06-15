/**
 * First-run setup — make the app self-contained without a system Python.
 *   1. run the per-OS installer (install.sh / install.ps1): venv + pip the stack
 *   2. download + SHA-256 verify any models listed in app.config (node, uniform
 *      across OSes; bundled models in resources/models/ skip this)
 *   3. drop a sentinel so subsequent launches skip straight to starting.
 * Progress lines are emitted via `onLog` for the first-run modal.
 */
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";

export interface ModelSpec {
  url: string;
  sha256: string;
  dest: string;
}

export interface FirstRunPaths {
  runtimeDir: string; // app-local: holds the venv + models + sentinel
  scriptsDir: string; // where install.sh / install.ps1 live (packaged resources)
}

export function venvDir(p: FirstRunPaths): string {
  return path.join(p.runtimeDir, "venv");
}
function modelsDir(p: FirstRunPaths): string {
  return path.join(p.runtimeDir, "models");
}
function sentinel(p: FirstRunPaths): string {
  return path.join(p.runtimeDir, ".installed");
}

export function isInstalled(p: FirstRunPaths): boolean {
  return fs.existsSync(sentinel(p));
}

function runScript(p: FirstRunPaths, pipSpec: string, onLog: (s: string) => void): Promise<void> {
  const isWin = process.platform === "win32";
  const script = path.join(p.scriptsDir, isWin ? "install.ps1" : "install.sh");
  const [cmd, args] = isWin
    ? ["powershell", ["-ExecutionPolicy", "Bypass", "-File", script, venvDir(p), pipSpec]]
    : ["bash", [script, venvDir(p), pipSpec]];
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args as string[], { stdio: ["ignore", "pipe", "pipe"] });
    proc.stdout.on("data", (b) => onLog(b.toString()));
    proc.stderr.on("data", (b) => onLog(b.toString()));
    proc.on("error", reject);
    proc.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`installer exited ${code}`)),
    );
  });
}

function sha256(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash("sha256");
    const s = fs.createReadStream(file);
    s.on("data", (d) => h.update(d));
    s.on("end", () => resolve(h.digest("hex")));
    s.on("error", reject);
  });
}

function download(url: string, dest: string, onLog: (s: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const file = fs.createWriteStream(dest);
    const client = url.startsWith("https") ? https : http;
    client
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`download ${res.statusCode} for ${url}`));
          return;
        }
        const total = Number(res.headers["content-length"] ?? 0);
        let got = 0;
        let lastPct = -1;
        res.on("data", (c) => {
          got += c.length;
          if (total) {
            const pct = Math.round((got / total) * 100);
            if (pct !== lastPct && pct % 5 === 0) {
              lastPct = pct;
              onLog(`[models] ${path.basename(dest)} ${pct}%`);
            }
          }
        });
        res.pipe(file);
        file.on("finish", () => file.close(() => resolve()));
      })
      .on("error", (e) => {
        fs.rm(dest, { force: true }, () => reject(e));
      });
  });
}

async function ensureModels(
  p: FirstRunPaths,
  models: ModelSpec[],
  onLog: (s: string) => void,
): Promise<void> {
  for (const m of models) {
    const dest = path.join(modelsDir(p), m.dest);
    if (fs.existsSync(dest) && (await sha256(dest)) === m.sha256) {
      onLog(`[models] ${m.dest} already present (verified)`);
      continue;
    }
    onLog(`[models] downloading ${m.dest}`);
    await download(m.url, dest, onLog);
    const actual = await sha256(dest);
    if (actual !== m.sha256) {
      fs.rmSync(dest, { force: true });
      throw new Error(`checksum mismatch for ${m.dest} (got ${actual})`);
    }
    onLog(`[models] ${m.dest} verified`);
  }
}

export async function runFirstRun(
  p: FirstRunPaths,
  pipSpec: string,
  models: ModelSpec[],
  onLog: (s: string) => void,
): Promise<void> {
  fs.mkdirSync(p.runtimeDir, { recursive: true });
  onLog("[setup] preparing the analysis engine (first run only)…");
  await runScript(p, pipSpec, onLog);
  await ensureModels(p, models, onLog);
  fs.writeFileSync(sentinel(p), new Date().toISOString());
  onLog("[setup] done — the engine is ready.");
}
