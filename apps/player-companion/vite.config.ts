import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    target: "es2018",
    // Keep CSS readable by older phone browsers (e.g. no `inset` shorthand).
    cssTarget: ["chrome61", "safari12"]
  },
  server: {
    host: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4310"
      },
      "/images": {
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
