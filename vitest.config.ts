import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "electron/**/*.test.ts"],
    // macOS writes AppleDouble `._*` sidecars on this exFAT volume.
    exclude: ["**/node_modules/**", "**/out/**", "**/._*"],
  },
});