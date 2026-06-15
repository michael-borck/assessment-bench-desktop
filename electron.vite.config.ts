import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "electron-vite";

// Main + preload live in electron/; the renderer (React) lives in src/.
export default defineConfig({
  main: {
    build: { lib: { entry: resolve(__dirname, "electron/main.ts") } },
  },
  preload: {
    build: { lib: { entry: resolve(__dirname, "electron/preload.ts") } },
  },
  renderer: {
    root: "src",
    build: {
      rollupOptions: { input: resolve(__dirname, "src/index.html") },
    },
    plugins: [react()],
  },
});
