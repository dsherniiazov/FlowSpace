import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiTarget = process.env.API_TARGET || "http://localhost:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: true,
    proxy: {
      "/api": {
        target: apiTarget,
        rewrite: (path) => path.replace(/^\/api/, ""),
        changeOrigin: true,
      },
      "/files": {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
});
