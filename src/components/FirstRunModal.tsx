import { useEffect, useRef, useState } from "react";

/**
 * First-run setup modal — streams the installer's `[install]`/`[models]`/`[setup]`
 * lines so a multi-minute, multi-GB setup is transparent (talk-buddy's pattern).
 */
export function FirstRunModal() {
  const [lines, setLines] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const offLog = window.lens.onSetupLog((l) => setLines((prev) => [...prev, l.trimEnd()]));
    const offErr = window.lens.onSetupError(setError);
    return () => {
      offLog();
      offErr();
    };
  }, []);

  useEffect(() => endRef.current?.scrollIntoView(), [lines]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "grid",
        placeItems: "center",
        zIndex: 10,
      }}
    >
      <div style={{ width: 640, maxWidth: "90vw", background: "#fff", borderRadius: 10, padding: 20 }}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Setting up the analysis engine</h2>
        <p style={{ color: "#555", marginTop: 4 }}>
          First run only — installing the local engine and models. This can take a
          few minutes and download a lot; everything stays on this machine.
        </p>
        <div
          style={{
            fontFamily: "ui-monospace, monospace",
            fontSize: 12,
            background: "#111",
            color: "#ddd",
            borderRadius: 6,
            padding: 12,
            height: 240,
            overflow: "auto",
            whiteSpace: "pre-wrap",
          }}
        >
          {lines.join("\n")}
          <div ref={endRef} />
        </div>
        {error && (
          <p style={{ color: "#c62828", marginBottom: 0 }}>
            Setup failed: {error}. Check your internet connection and that Python 3.11+
            is installed, then restart the app.
          </p>
        )}
      </div>
    </div>
  );
}
