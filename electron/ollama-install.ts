/**
 * One-off Ollama install — the app stays zero-dependency until the user opts
 * in, then this fetches and runs the official installer for the current OS and
 * waits for the local server. No admin assumptions beyond what each installer
 * itself needs; progress streams to the renderer.
 *
 *   macOS:  download Ollama-darwin.zip → unpack to /Applications → launch
 *   Windows: download OllamaSetup.exe (InnoSetup) → silent install (it
 *            auto-starts the server on exit)
 *   Linux:  the official install.sh (needs sudo; streamed live)
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";

export interface InstallProgress {
  status: string;
  percent: number | null; // download percent, null while indeterminate
}

const SERVER = "http://127.0.0.1:11434";

function download(
  url: string,
  dest: string,
  onProgress: (p: InstallProgress) => void,
  redirects = 0,
): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const client = url.startsWith("https") ? https : http;
    client
      .get(url, { headers: { "User-Agent": "assessment-bench-desktop" } }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400) {
          res.resume();
          const location = res.headers.location;
          if (!location || redirects >= 5) {
            reject(new Error(`too many redirects for ${url}`));
            return;
          }
          resolve(download(new URL(location, url).toString(), dest, onProgress, redirects + 1));
          return;
        }
        if (!res.statusCode || res.statusCode >= 400) {
          res.resume();
          reject(new Error(`download failed (HTTP ${res.statusCode}) for ${url}`));
          return;
        }
        const file = fs.createWriteStream(dest);
        const total = Number(res.headers["content-length"] ?? 0);
        let got = 0;
        let lastPct = -1;
        res.on("data", (c) => {
          got += c.length;
          if (total) {
            const pct = Math.round((got / total) * 100);
            if (pct !== lastPct) {
              lastPct = pct;
              onProgress({ status: `downloading ${path.basename(dest)}`, percent: pct });
            }
          } else {
            onProgress({
              status: `downloading ${path.basename(dest)} (${Math.round(got / 1e6)} MB)`,
              percent: null,
            });
          }
        });
        res.pipe(file);
        file.on("finish", () => file.close(() => resolve()));
        file.on("error", reject);
      })
      .on("error", reject);
  });
}

function run(cmd: string, args: string[], onLog: (s: string) => void): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    proc.stdout.on("data", (b) => onLog(b.toString().trim()));
    proc.stderr.on("data", (b) => onLog(b.toString().trim()));
    proc.on("error", reject);
    proc.on("exit", (code) => resolve(code ?? -1));
  });
}

export async function waitForServer(
  timeoutMs: number,
  onStatus: (s: string) => void,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await new Promise<void>((resolve, reject) => {
        const req = http.request(`${SERVER}/api/version`, { timeout: 2000 }, (res) => {
          res.resume();
          res.statusCode === 200 ? resolve() : reject(new Error(`HTTP ${res.statusCode}`));
        });
        req.on("error", reject);
        req.on("timeout", () => req.destroy(new Error("timeout")));
        req.end();
      });
      onStatus("Ollama is running");
      return;
    } catch {
      onStatus("waiting for the Ollama server…");
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error("Ollama did not start in time — launch it manually and press check again");
}

export async function installOllama(onProgress: (p: InstallProgress) => void): Promise<void> {
  const tmp = path.join(os.tmpdir(), "assessment-bench-ollama");
  if (process.platform === "darwin") {
    const zip = path.join(tmp, "Ollama-darwin.zip");
    onProgress({ status: "downloading Ollama for Mac…", percent: 0 });
    await download("https://ollama.com/download/Ollama-darwin.zip", zip, onProgress);
    onProgress({ status: "unpacking to /Applications…", percent: null });
    // /Applications is group-admin writable; no sudo on a standard setup.
    const code = await run("/usr/bin/ditto", ["-x", "-k", zip, "/Applications"], (l) =>
      onProgress({ status: l, percent: null }),
    );
    if (code !== 0)
      throw new Error(
        "could not unpack Ollama into /Applications — install it manually from ollama.com/download",
      );
    fs.rmSync(zip, { force: true });
    onProgress({ status: "starting Ollama…", percent: null });
    await run("/usr/bin/open", ["-a", "Ollama"], () => {});
    await waitForServer(60_000, (s) => onProgress({ status: s, percent: null }));
  } else if (process.platform === "win32") {
    const exe = path.join(tmp, "OllamaSetup.exe");
    onProgress({ status: "downloading the Ollama installer…", percent: 0 });
    await download("https://ollama.com/download/OllamaSetup.exe", exe, onProgress);
    onProgress({ status: "running the installer (silent)…", percent: null });
    const code = await run(exe, ["/VERYSILENT", "/NORESTART"], (l) =>
      onProgress({ status: l, percent: null }),
    );
    if (code !== 0)
      throw new Error(
        `Ollama installer exited ${code} — install it manually from ollama.com/download`,
      );
    fs.rmSync(exe, { force: true });
    // The installer starts the server on exit; give it a moment.
    await waitForServer(90_000, (s) => onProgress({ status: s, percent: null }));
  } else if (process.platform === "linux") {
    onProgress({ status: "running the official install script (may ask for sudo)…", percent: null });
    const code = await run("bash", ["-c", "curl -fsSL https://ollama.com/install.sh | sh"], (l) =>
      onProgress({ status: l, percent: null }),
    );
    if (code !== 0)
      throw new Error(
        "the Ollama install script failed — install it manually from ollama.com/download",
      );
    onProgress({ status: "starting the Ollama server…", percent: null });
    await run(
      "bash",
      ["-c", "systemctl --user restart ollama 2>/dev/null || nohup ollama serve >/dev/null 2>&1 &"],
      () => {},
    );
    await waitForServer(60_000, (s) => onProgress({ status: s, percent: null }));
  } else {
    throw new Error(`unsupported platform: ${process.platform}`);
  }
}