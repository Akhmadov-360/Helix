import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Порт 5173 (CLAUDE.md). Каркас M1-forward: фичи/роутинг добавляются на своих вехах.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
