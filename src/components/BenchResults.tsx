/** Render an ExperimentResult — plain-language findings first, then the
 *  agreement table and per-arm repeatability for people who want the numbers.
 *  The bench MEASURES methods; it does not mark students. */

interface Agreement {
  measure: string;
  n: number;
  pearson: number | null;
  spearman: number | null;
}
interface RunStats {
  reliability: number;
  mean: number;
  std_dev: number;
  n: number;
}
interface ArmOutcome {
  submission_id: string;
  arm_id: string;
  stats: RunStats | null;
}
export interface ExperimentResult {
  name: string;
  max_score: number;
  submissions: string[];
  outcomes: ArmOutcome[];
  agreements: Agreement[];
}

function fmt(x: number | null): string {
  return x == null ? "—" : x.toFixed(3);
}

function strength(r: number): string {
  const a = Math.abs(r);
  if (a >= 0.8) return "strong";
  if (a >= 0.5) return "moderate";
  if (a >= 0.3) return "weak";
  return "little";
}

interface ArmSummary {
  arm: string;
  reliability: number;
  spread: number; // mean per-submission std-dev, in score points
}

function summariseArms(result: ExperimentResult): ArmSummary[] {
  const byArm = new Map<string, RunStats[]>();
  for (const o of result.outcomes) {
    if (o.stats) byArm.set(o.arm_id, [...(byArm.get(o.arm_id) ?? []), o.stats]);
  }
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return [...byArm.entries()].map(([arm, stats]) => ({
    arm,
    reliability: avg(stats.map((s) => s.reliability)),
    spread: avg(stats.map((s) => s.std_dev)),
  }));
}

/** One plain sentence per finding, for readers who don't live in r values. */
function findings(result: ExperimentResult, arms: ArmSummary[]): string[] {
  const out: string[] = [];
  const byMeasure = new Map(result.agreements.map((a) => [a.measure, a]));
  const armIds = new Set(arms.map((a) => a.arm));

  for (const a of arms) {
    const agr = byMeasure.get(a.arm);
    const spread =
      a.spread > 0
        ? `varied ±${a.spread.toFixed(1)} points between repeated runs`
        : "gave the same score every run";
    if (agr?.pearson != null) {
      out.push(
        `“${a.arm}” showed ${strength(agr.pearson)} agreement with your marks ` +
          `(r=${agr.pearson.toFixed(2)} across ${agr.n} submissions) and ${spread}.`,
      );
    } else {
      out.push(`“${a.arm}” ${spread}.`);
    }
  }

  const signals = result.agreements.filter(
    (a) =>
      !armIds.has(a.measure) &&
      a.measure !== "distinctiveness.mean_similarity" &&
      a.pearson != null,
  );
  if (signals.length) {
    const best = signals.reduce((x, y) =>
      Math.abs(y.pearson!) > Math.abs(x.pearson!) ? y : x,
    );
    out.push(
      `The single signal that best tracked your marks was ${best.measure} ` +
        `(r=${best.pearson!.toFixed(2)}) — ${strength(best.pearson!)} agreement without any LLM.`,
    );
  }

  const dist = byMeasure.get("distinctiveness.mean_similarity");
  if (dist?.pearson != null && Math.abs(dist.pearson) >= 0.3) {
    out.push(
      dist.pearson > 0
        ? `Submissions typical of the cohort tended to receive higher marks (similarity vs marks r=${dist.pearson.toFixed(2)}) — worth a look at how the distinctive ones were marked.`
        : `Distinctive submissions tended to receive higher marks (similarity vs marks r=${dist.pearson.toFixed(2)}).`,
    );
  }
  return out;
}

export function BenchResults({ result }: { result: ExperimentResult }) {
  const arms = summariseArms(result);
  const sentences = findings(result, arms);

  return (
    <div>
      <h2 style={{ fontSize: 16 }}>
        {result.name} — {result.submissions.length} submissions
      </h2>
      <p style={{ color: "#777", fontSize: 13, marginTop: -6 }}>
        The bench measures how each method agrees with the human marks. It never marks students.
      </p>

      {sentences.length > 0 && (
        <>
          <h3 style={{ fontSize: 14 }}>What this run found</h3>
          <ul style={{ fontSize: 13, color: "#333", lineHeight: 1.6 }}>
            {sentences.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </>
      )}

      <h3 style={{ fontSize: 14 }}>Agreement with human marks</h3>
      {result.agreements.length === 0 ? (
        <p style={{ color: "#777", fontSize: 13 }}>
          No agreement stats — add your own marks (a <code>submission_id,mark</code> CSV) to see
          which method agrees with your judgement.
        </p>
      ) : (
        <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
              <th style={{ padding: "4px 8px" }}>measure</th>
              <th style={{ padding: "4px 8px" }}>n</th>
              <th style={{ padding: "4px 8px" }}>Pearson</th>
              <th style={{ padding: "4px 8px" }}>Spearman</th>
            </tr>
          </thead>
          <tbody>
            {[...result.agreements]
              .sort((a, b) => (b.pearson ?? -2) - (a.pearson ?? -2))
              .map((a) => (
                <tr key={a.measure} style={{ borderTop: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "4px 8px" }}>{a.measure}</td>
                  <td style={{ padding: "4px 8px" }}>{a.n}</td>
                  <td style={{ padding: "4px 8px" }}>{fmt(a.pearson)}</td>
                  <td style={{ padding: "4px 8px" }}>{fmt(a.spearman)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      )}

      {arms.length > 0 && (
        <>
          <h3 style={{ fontSize: 14, marginTop: 16 }}>Arm repeatability</h3>
          <ul style={{ fontSize: 13, color: "#555" }}>
            {arms.map((a) => (
              <li key={a.arm}>
                {a.arm}: reliability {a.reliability.toFixed(2)}
                {a.spread > 0 ? ` (scores varied ±${a.spread.toFixed(1)} points)` : " (identical scores every run)"}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
