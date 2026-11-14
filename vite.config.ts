import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
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
