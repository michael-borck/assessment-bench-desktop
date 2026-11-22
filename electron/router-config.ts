/**
 * Router config generation — the auto-analyser config that points every bundled
 * specialist at its local CLI. Pure and side-effect-free so it can be unit
 * tested; main.ts writes the result beside the sidecar's cwd.
 *
 * auto-analyser defaults every specialist to an HTTP service on localhost:800x
 * (a dev-machine convention). A packaged app ships the CLIs in its own venv, so
 * it must write this file or nothing routes.
 */

/** Derive the specialist CLI names from the pip specs, e.g.
 *  "assessment-bench[serve,analysers,llm]==0.5.1" → (skipped, not an -analyser)
 *  "document-analyser[embeddings]" → "document-analyser"
 *  "video-analyser>=0.13.0"        → "video-analyser"  (note: NOT "...>")
 *  "auto-analyser>=0.8.0"          → (skipped: it is the router, not a target) */
export function routerMembers(pipSpecs: string[]): string[] {
  return pipSpecs
    .map((s) => s.trim().match(/^[A-Za-z0-9._-]+/)?.[0] ?? "")
    .filter((n) => n.endsWith("-analyser") && n !== "auto-analyser");
}

/** Render the auto-analyser YAML. */
export function renderRouterConfig(members: string[], cascadesEnabled: boolean): string {
  return [
    "# Written by the app — routes to the bundled local CLIs.",
    "analysers:",
    ...members.map((m) => `  ${m}: { type: cli, command: ${m} }`),
    `cascades:\n  enabled: ${cascadesEnabled}`,
    "",
  ].join("\n");
}