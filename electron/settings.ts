/**
 * User settings — tiny JSON file in userData. Holds the chosen local model tier
 * and the heuristic-cascade gate; main injects the tier into the sidecar env and
 * rewrites the router config when the gate changes.
 */
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

export interface Settings {
  ollamaModel?: string;
  // Heuristic cascade passes (chat/journal auto-detection + provenance
  // metadata reads) in the signals arm. Default on; results are labelled.
  heuristics?: boolean;
}

const file = () => path.join(app.getPath("userData"), "settings.json");

export function loadSettings(): Settings {
  try {
    return JSON.parse(fs.readFileSync(file(), "utf8")) as Settings;
  } catch {
    return {};
  }
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const next = { ...loadSettings(), ...patch };
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(next, null, 2));
  return next;
}