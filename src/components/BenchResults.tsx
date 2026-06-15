/** Render an ExperimentResult — agreement with human marks + per-arm reliability.
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

export function BenchResults({ result }: { result: ExperimentResult }) {
  // Average reliability per LLM arm (arms that produced repeated runs).
  const byArm = new Map<string, number[]>();
  for (const o of result.outcomes) {
    if (o.stats) byArm.set(o.arm_id, [...(byArm.get(o.arm_id) ?? []), o.stats.reliability]);
  }
  const armReliability = [...byArm.entries()].map(([arm, rs]) => ({
    arm,
    reliability: rs.reduce((a, b) => a + b, 0) / rs.length,
  }));

  return (
    <div>
      <h2 style={{ fontSize: 16 }}>
        {result.name} — {result.submissions.length} submissions
      </h2>
      <p style={{ color: "#777", fontSize: 13, marginTop: -6 }}>
        The bench measures how each method agrees with the human marks. It never marks students.
      </p>

      <h3 style={{ fontSize: 14 }}>Agreement with human marks</h3>
      {result.agreements.length === 0 ? (
        <p style={{ color: "#777", fontSize: 13 }}>
          No agreement stats (add a <code>human_marks</code> CSV to the experiment).
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

      {armReliability.length > 0 && (
        <>
          <h3 style={{ fontSize: 14, marginTop: 16 }}>Arm reliability (repeatability)</h3>
          <ul style={{ fontSize: 13, color: "#555" }}>
            {armReliability.map((a) => (
              <li key={a.arm}>
                {a.arm}: {a.reliability.toFixed(2)}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
