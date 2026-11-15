import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In development the API server runs separately (npm run dev -w @nextion-arduino/server, port 8765).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { "/api": { target: "http://127.0.0.1:8765", ws: true } },
  },
});
