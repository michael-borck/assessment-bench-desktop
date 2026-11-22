import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExperimentBuilder, type ExperimentConfigPayload } from "./ExperimentBuilder";

const onRun = vi.fn<(config: ExperimentConfigPayload) => void>();

function mockLens(overrides: Record<string, unknown> = {}) {
  const lens = {
    config: vi.fn().mockResolvedValue({
      productName: "Assessment Bench",
      ollama: {
        models: { small: { id: "qwen3.5:2b" }, large: { id: "qwen3.5:4b" } },
        defaultModel: "qwen3.5:2b",
      },
      system: { platform: "darwin", totalMemGB: 32, recommendedTier: "large" },
      settings: {},
    }),
    keysStatus: vi.fn().mockResolvedValue({ anthropic: true }),
    keysSave: vi.fn().mockResolvedValue(true),
    pickFile: vi.fn().mockResolvedValue("/tmp/rubric.yaml"),
    pickDir: vi.fn().mockResolvedValue("/tmp/submissions"),
    ...overrides,
  };
  (window as unknown as { lens: typeof lens }).lens = lens;
  return lens;
}

beforeEach(() => {
  onRun.mockClear();
  mockLens();
});
afterEach(() => {
  vi.restoreAllMocks();
});

function renderBuilder(ready = true) {
  return render(<ExperimentBuilder ready={ready} running={false} onRun={onRun} />);
}

describe("ExperimentBuilder", () => {
  it("starts with llm, signals and hybrid arms", () => {
    renderBuilder();
    expect(screen.getByDisplayValue(/^llm-anthropic/)).toBeInTheDocument();
    expect(screen.getByDisplayValue(/^signals/)).toBeInTheDocument();
    expect(screen.getByDisplayValue(/^hybrid-anthropic/)).toBeInTheDocument();
  });

  it("blocks the run until a rubric and cohort are chosen", () => {
    renderBuilder();
    const run = screen.getByRole("button", { name: "Run experiment" });
    expect(run).toBeDisabled();
    expect(screen.getByText(/To run:/)).toHaveTextContent(/choose a rubric file/);
    expect(screen.getByText(/To run:/)).toHaveTextContent(/choose the submissions folder/);
  });

  it("builds a config with absolute paths and the chosen arms", async () => {
    renderBuilder();
    fireEvent.click(screen.getByRole("button", { name: /Choose rubric/ }));
    fireEvent.click(screen.getByRole("button", { name: /Choose folder/ }));

    const run = screen.getByRole("button", { name: "Run experiment" });
    await vi.waitFor(() => expect(run).toBeEnabled());
    fireEvent.click(run);

    expect(onRun).toHaveBeenCalledTimes(1);
    const cfg = onRun.mock.calls[0][0];
    expect(cfg.rubric).toBe("/tmp/rubric.yaml");
    expect(cfg.submissions).toBe("/tmp/submissions");
    expect(cfg.arms).toHaveLength(3);
    expect(cfg.arms[0]).toMatchObject({
      kind: "llm",
      provider: { provider: "anthropic", model: "claude-haiku-4-5" },
    });
    expect(cfg.arms[1]).toMatchObject({ kind: "signals" });
    expect(cfg.arms[2]).toMatchObject({ kind: "hybrid" });
  });

  it("defaults a switched ollama arm to the curated local model", async () => {
    renderBuilder();
    const providerSelects = screen.getAllByDisplayValue("Anthropic (Claude)");
    fireEvent.change(providerSelects[0], { target: { value: "ollama" } });

    // The first arm's model input now shows the curated default, and no key is
    // required for the local provider.
    expect(screen.getAllByDisplayValue("qwen3.5:2b")).toHaveLength(1);
    expect(screen.queryByText(/paste your Anthropic/)).not.toBeInTheDocument();
  });

  it("warns when an LLM arm's provider has no API key", () => {
    mockLens({ keysStatus: vi.fn().mockResolvedValue({}) });
    renderBuilder();
    expect(screen.getByText(/To run:/)).toHaveTextContent(/save an API key for Anthropic/);
  });
});