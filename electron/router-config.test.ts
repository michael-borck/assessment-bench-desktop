import { describe, expect, it } from "vitest";
import CONFIG from "../app.config.cjs";
import { renderRouterConfig, routerMembers } from "./router-config";

const SPECS = CONFIG.sidecarPipSpecs as string[];

describe("routerMembers", () => {
  it("keeps every specialist analyser and drops the engine and the router", () => {
    const members = routerMembers(SPECS);
    expect(members).toContain("document-analyser");
    expect(members).toContain("video-analyser");
    expect(members).toContain("records-analyser");
    // The engine and the router itself are not routing targets.
    expect(members).not.toContain("assessment-bench");
    expect(members).not.toContain("auto-analyser");
  });

  it("strips extras and version pins from each spec", () => {
    const members = routerMembers([
      "document-analyser[embeddings]",
      "video-analyser>=0.13.0",
      "assessment-bench[serve]==0.5.1",
      "auto-analyser>=0.8.0",
    ]);
    expect(members).toEqual(["document-analyser", "video-analyser"]);
  });

  it("returns a bare CLI name for every member (no version, no extras)", () => {
    for (const m of routerMembers(SPECS)) {
      expect(m).toMatch(/^[a-z]+-analyser$/);
    }
  });
});

describe("renderRouterConfig", () => {
  it("emits a cli entry per member", () => {
    const text = renderRouterConfig(["document-analyser", "code-analyser"], true);
    expect(text).toContain("analysers:");
    expect(text).toContain("  document-analyser: { type: cli, command: document-analyser }");
    expect(text).toContain("  code-analyser: { type: cli, command: code-analyser }");
  });

  it("encodes the heuristic cascade gate", () => {
    expect(renderRouterConfig(["image-analyser"], false)).toContain("enabled: false");
    expect(renderRouterConfig(["image-analyser"], true)).toContain("enabled: true");
  });

  it("round-trips through a YAML parser with the expected shape", async () => {
    const yaml = await import("js-yaml");
    const doc = yaml.load(renderRouterConfig(["diagram-analyser"], true)) as {
      analysers: Record<string, { type: string; command: string }>;
      cascades: { enabled: boolean };
    };
    expect(doc.analysers["diagram-analyser"]).toEqual({
      type: "cli",
      command: "diagram-analyser",
    });
    expect(doc.cascades.enabled).toBe(true);
  });
});