import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4310"
      },
      "/health": {
        target: "http://127.0.0.1:4310"
      },
      "/ws": {
        target: "ws://127.0.0.1:4310",
        ws: true
      }
    }
  }
});
