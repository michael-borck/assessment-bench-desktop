/**
 * Python sidecar manager — spawns the app's `serve` HTTP API from the app-local
 * venv, supervises it, and exposes its localhost URL to the renderer. Adapted
 * from document-lens's BackendManager + talk-buddy's embedded server: free-port
 * pick, bearer token, /health poll, phase state machine, bounded auto-restart,
 * graceful->SIGTERM->SIGKILL shutdown.
 */
import { ChildProcess, spawn } from "node:child_process";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import http from "node:http";
import net from "node:net";
import path from "node:path";

export type Phase = "not-started" | "installing" | "starting" | "ready" | "unreachable" | "crashed";

export interface SidecarConfig {
  venvDir: string; // app-local venv (created by the first-run installer)
  serveCommand: string; // e.g. "assessment-bench serve --port {PORT} --host {HOST}"
  healthPath: string; // e.g. "/health"
  defaultPort: number;
  authTokenEnv: string; // env var the member reads its bearer token from, e.g. "ASSESSMENT_BENCH_AUTH_TOKEN"
  extraEnv?: NodeJS.ProcessEnv;
  // Working directory for the engine. The members' .env loader walks cwd
  // upward, so pointing this at the app runtime dir lets in-app-saved API
  // keys (runtime/.env) reach the engine.
  cwd?: string;
}

const HOST = "127.0.0.1";
const MAX_RESTARTS = 3;
const RESTART_BACKOFF_MS = 2000;
const STARTUP_TIMEOUT_MS = 60_000;

function venvBin(venvDir: string, exe: string): string {
  // Windows venvs put executables in Scripts\; POSIX in bin/.
  return process.platform === "win32"
    ? path.join(venvDir, "Scripts", `${exe}.exe`)
    : path.join(venvDir, "bin", exe);
}

async function freePort(preferred: number): Promise<number> {
  const tryPort = (p: number) =>
    new Promise<boolean>((resolve) => {
      const srv = net.createServer();
      srv.once("error", () => resolve(false));
      srv.once("listening", () => srv.close(() => resolve(true)));
      srv.listen(p, HOST);
    });
  for (let p = preferred; p < preferred + 50; p++) {
    if (await tryPort(p)) return p;
  }
  throw new Error(`no free port in ${preferred}–${preferred + 49}`);
}

export class SidecarManager extends EventEmitter {
  private proc: ChildProcess | null = null;
  private phase: Phase = "not-started";
  private port = 0;
  private restarts = 0;
  private restartTimer: NodeJS.Timeout | null = null;
  readonly token = crypto.randomBytes(32).toString("hex");

  constructor(private cfg: SidecarConfig) {
    super();
  }

  get url(): string {
    return `http://${HOST}:${this.port}`;
  }
  // NO token here: this object is relayed to the renderer, and the token must
  // stay in main (the renderer talks to the sidecar only through main's proxy).
  get status(): { phase: Phase; url: string } {
    return { phase: this.phase, url: this.url };
  }

  private setPhase(p: Phase): void {
    this.phase = p;
    this.emit("status", this.status);
  }

  async start(): Promise<void> {
    if (this.proc) return;
    this.port = await freePort(this.cfg.defaultPort);
    const [exe, ...rest] = this.cfg.serveCommand.split(" ");
    const args = rest.map((a) =>
      a.replace("{PORT}", String(this.port)).replace("{HOST}", HOST),
    );
    const cmd = venvBin(this.cfg.venvDir, exe);

    this.setPhase("starting");
    this.proc = spawn(cmd, args, {
      cwd: this.cfg.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        ...this.cfg.extraEnv,
        // The member gates everything but /health + /manifest on this token
        // (lens-contract add_auth reads {PREFIX}_AUTH_TOKEN; name from config).
        [this.cfg.authTokenEnv]: this.token,
      },
    });
    this.proc.stdout?.on("data", (b) => this.emit("log", b.toString()));
    this.proc.stderr?.on("data", (b) => this.emit("log", b.toString()));
    this.proc.on("exit", (code) => {
      this.proc = null;
      if (this.phase !== "not-started") {
        this.setPhase("crashed");
        this.emit("log", `[sidecar] exited (${code})`);
        this.scheduleRestart();
      }
    });

    await this.waitReady();
  }

  private waitReady(): Promise<void> {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const check = () => {
        this.health()
          .then(() => {
            this.restarts = 0;
            this.setPhase("ready");
            this.monitor();
            resolve();
          })
          .catch(() => {
            if (Date.now() - start > STARTUP_TIMEOUT_MS) {
              reject(new Error("sidecar startup timed out"));
            } else {
              setTimeout(check, 500);
            }
          });
      };
      setTimeout(check, 500);
    });
  }

  private monitoring = false;

  private monitor(): void {
    if (this.monitoring) return; // one loop, even across restarts
    this.monitoring = true;
    const tick = () => {
      // Keep polling through "unreachable" so a recovered sidecar goes green
      // again; stop only when the process is gone (crashed/stopped restart paths
      // re-enter via waitReady).
      if (this.phase !== "ready" && this.phase !== "unreachable") {
        this.monitoring = false;
        return;
      }
      this.health()
        .then(() => {
          if (this.phase === "unreachable") this.setPhase("ready");
        })
        .catch(() => {
          if (this.phase === "ready") this.setPhase("unreachable");
        })
        .finally(() => setTimeout(tick, 5000));
    };
    setTimeout(tick, 5000);
  }

  private scheduleRestart(): void {
    if (this.restartTimer || this.restarts >= MAX_RESTARTS) return;
    this.restarts++;
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      this.start().catch((e) => this.emit("log", `[sidecar] restart failed: ${e}`));
    }, RESTART_BACKOFF_MS * this.restarts);
  }

  private health(): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = http.request(
        { hostname: HOST, port: this.port, path: this.cfg.healthPath, timeout: 4000 },
        (res) => (res.statusCode === 200 ? resolve() : reject(new Error(`health ${res.statusCode}`))),
      );
      req.on("error", reject);
      req.on("timeout", () => req.destroy(new Error("health timeout")));
      req.end();
    });
  }

  async stop(): Promise<void> {
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.setPhase("not-started");
    const p = this.proc;
    this.proc = null;
    if (!p) return;
    p.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        p.kill("SIGKILL");
        resolve();
      }, 5000);
      p.on("exit", () => {
        clearTimeout(t);
        resolve();
      });
    });
  }
}
