import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";

// Commit stamped into scenario exports (ACCEPTANCE_CRITERIA §D).
const commit = (() => {
  try { return execSync("git rev-parse --short HEAD").toString().trim(); } catch { return "desconhecido"; }
})();
export default defineConfig({
  plugins: [react()],
  define: { __APP_COMMIT__: JSON.stringify(commit) },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${process.env.HABITATFIRE_API_PORT || 8000}`,
        changeOrigin: false,
      },
    },
  },
  build: { chunkSizeWarningLimit: 1100 },
});
