import type { SidecarStatus } from "../../global";

const LABELS: Record<SidecarStatus["phase"], { text: string; color: string }> = {
  "not-started": { text: "Engine idle", color: "#999" },
  installing: { text: "Setting up engine…", color: "#b8860b" },
  starting: { text: "Engine starting…", color: "#b8860b" },
  ready: { text: "Engine ready", color: "#2e7d32" },
  unreachable: { text: "Engine offline", color: "#c62828" },
  crashed: { text: "Engine restarting…", color: "#c62828" },
};

export function EngineStatus({ status }: { status: SidecarStatus }) {
  const { text, color } = LABELS[status.phase];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
      {text}
    </span>
  );
}
