import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BenchResults, type ExperimentResult } from "./BenchResults";

const result: ExperimentResult = {
  name: "Demo experiment",
  max_score: 100,
  submissions: ["alice", "bob"],
  outcomes: [
    { submission_id: "alice", arm_id: "llm", stats: { reliability: 0.8, mean: 70, std_dev: 4, n: 3 } },
    { submission_id: "bob", arm_id: "llm", stats: { reliability: 0.8, mean: 72, std_dev: 4, n: 3 } },
  ],
  agreements: [
    { measure: "llm", n: 2, pearson: 0.72, spearman: 0.65 },
    { measure: "document.word_count", n: 2, pearson: 0.41, spearman: 0.38 },
  ],
};

describe("BenchResults", () => {
  it("heads the run with the cohort size", () => {
    render(<BenchResults result={result} />);
    expect(screen.getByRole("heading", { name: /Demo experiment — 2 submissions/ })).toBeInTheDocument();
  });

  it("states the finding in plain language and shows the agreement table", () => {
    render(<BenchResults result={result} />);
    expect(screen.getByText(/What this run found/)).toBeInTheDocument();
    expect(screen.getByText(/showed moderate agreement with your marks/)).toBeInTheDocument();
    expect(screen.getByText("Agreement with human marks")).toBeInTheDocument();
    expect(screen.getByText("document.word_count")).toBeInTheDocument();
  });

  it("lists per-arm repeatability", () => {
    render(<BenchResults result={result} />);
    expect(screen.getByText("Arm repeatability")).toBeInTheDocument();
    expect(screen.getByText(/llm: reliability 0.80/)).toBeInTheDocument();
  });

  it("explains the absence of agreement stats when no human marks were supplied", () => {
    render(<BenchResults result={{ ...result, agreements: [] }} />);
    expect(screen.getByText(/No agreement stats/)).toBeInTheDocument();
  });
});