/**
 * Electron main — window, first-run setup, sidecar supervision, Ollama IPC,
 * auto-update. The renderer never touches Python: it talks to the sidecar's
 * localhost HTTP API (URL + token handed over via IPC) and drives setup/Ollama
 * through the channels below.
 */
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { autoUpdater } from "electron-updater";
import yaml from "js-yaml";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

import * as ollama from "./ollama";
import { FirstRunPaths, isInstalled, runFirstRun, venvDir } from "./first-run";
import { SidecarManager } from "./sidecar-manager";
// Bundled at build time (single source of truth shared with electron-builder).
import CONFIG from "../app.config.cjs";

const isDev = !app.isPackaged;
let win: BrowserWindow | null = null;
let sidecar: SidecarManager | null = null;

function paths(): FirstRunPaths {
  return {
    runtimeDir: path.join(app.getPath("userData"), "runtime"),
    // dev: out/main -> repo root; prod: packaged under resources/scripts.
    scriptsDir: isDev
      ? path.join(app.getAppPath(), "scripts")
      : path.join(process.resourcesPath, "scripts"),
  };
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1100,
    height: 760,
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // preload needs limited node; renderer stays isolated
    },
  });
  // electron-vite serves the renderer in dev; loads the built file in prod.
  if (isDev && process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else win.loadFile(path.join(__dirname, "../renderer/index.html"));
}

function send(channel: string, payload: unknown): void {
  win?.webContents.send(channel, payload);
}

async function boot(): Promise<void> {
  const p = paths();

  // 1. First run: install the engine, streaming progress to the renderer modal.
  if (!isInstalled(p)) {
    send("setup:phase", "installing");
    try {
      await runFirstRun(p, CONFIG.sidecarPipSpec, CONFIG.models ?? [], (line) =>
        send("setup:log", line),
      );
    } catch (e) {
      send("setup:error", String(e));
      return;
    }
  }

  // 2. Start + supervise the sidecar.
  sidecar = new SidecarManager({
    venvDir: venvDir(p),
    serveCommand: CONFIG.serveCommand,
    healthPath: CONFIG.healthPath,
    defaultPort: CONFIG.defaultPort,
  });
  sidecar.on("status", (s) => send("sidecar:status", s));
  sidecar.on("log", (l: string) => send("sidecar:log", l));
  try {
    await sidecar.start();
  } catch (e) {
    send("setup:error", String(e));
  }
}

/** Proxy a JSON request to the sidecar (renderer -> main -> sidecar): keeps the
 *  bearer token in main and sidesteps CORS. Returns {status, body}. */
function sidecarRequest(
  method: string,
  reqPath: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    if (!sidecar) return reject(new Error("engine not started"));
    const url = new URL(sidecar.url + reqPath);
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers: {
          Authorization: `Bearer ${sidecar.token}`,
          ...(payload ? { "Content-Type": "application/json" } : {}),
        },
      },
      (res) => {
        let buf = "";
        res.on("data", (c) => (buf += c));
        res.on("end", () => {
          let parsed: unknown = buf;
          try {
            parsed = JSON.parse(buf);
          } catch {
            /* non-JSON (e.g. empty) */
          }
          resolve({ status: res.statusCode ?? 0, body: parsed });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function registerIpc(): void {
  ipcMain.handle("sidecar:status", () => sidecar?.status ?? { phase: "not-started" });
  ipcMain.handle("sidecar:request", (_e, method: string, p: string, body?: unknown) =>
    sidecarRequest(method, p, body),
  );
  ipcMain.handle("ollama:detect", () => ollama.detect());
  ipcMain.handle("ollama:pull", (_e, model: string) =>
    ollama.pull(model, CONFIG.ollama.recommendedModel, (prog) => send("ollama:progress", prog)),
  );
  ipcMain.handle("app:config", () => ({
    productName: CONFIG.productName,
    ollama: CONFIG.ollama,
  }));
  ipcMain.handle("dialog:pickDir", async () => {
    const r = await dialog.showOpenDialog(win!, { properties: ["openDirectory"] });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle("dialog:pickFile", async (_e, filters?: { name: string; extensions: string[] }[]) => {
    const r = await dialog.showOpenDialog(win!, { properties: ["openFile"], filters });
    return r.canceled ? null : r.filePaths[0];
  });

  // Bench-specific: read an experiment YAML, resolve its paths to absolute
  // (the API resolves nothing relative), and start the run on the sidecar.
  ipcMain.handle("experiment:start", async (_e, yamlPath: string) => {
    const baseDir = path.dirname(yamlPath);
    const cfg = yaml.load(fs.readFileSync(yamlPath, "utf8")) as Record<string, unknown>;
    for (const key of ["rubric", "submissions", "human_marks"]) {
      const v = cfg[key];
      if (typeof v === "string") cfg[key] = path.resolve(baseDir, v);
    }
    const out = path.join(baseDir, "bench-out");
    const res = await sidecarRequest("POST", "/experiments", { config: cfg, out });
    return res;
  });
}

async function shutdown(): Promise<void> {
  if (sidecar) await sidecar.stop();
}

app.whenReady().then(() => {
  createWindow();
  registerIpc();
  void boot();
  if (!isDev) {
    setTimeout(() => autoUpdater.checkForUpdatesAndNotify().catch(() => {}), 30_000);
  }
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", (e) => {
  e.preventDefault();
  void shutdown().finally(() => app.exit(0));
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
