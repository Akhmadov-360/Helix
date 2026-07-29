import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

export default defineConfig({
  plugins: [
    // ДО react: плагин генерит routeTree.gen.ts, который react-плагин затем трансформит.
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    tailwindcss(),
    // React Compiler (frontend-architecture.md §1.1): мемоизация на сборке → ручные
    // useMemo/useCallback = code smell. Цена — compiler-safe код, энфорсит eslint (см. eslint.config.mjs).
    react({ babel: { plugins: [["babel-plugin-react-compiler", {}]] } }),
  ],
  server: { port: 5173 },
});
