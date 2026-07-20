import base from "@helix/eslint-config";
import globals from "globals";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...base,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      // Браузерное окружение (document, window). React-специфичные плагины
      // (react-hooks/react-refresh) заводим, когда появятся реальные компоненты.
      globals: { ...globals.browser },
    },
  },
];
