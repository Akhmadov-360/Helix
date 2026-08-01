import base from "@helix/eslint-config";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...base,
  // React Compiler включён (frontend-architecture.md §1.1) → код обязан быть compiler-safe.
  // v7: flat-конфиги под configs.flat.* (top-level recommended-latest — легаси eslintrc-формат).
  // recommended-latest несёт rules-of-hooks + compiler-диагностику (purity/set-state-in-render/…),
  // которую компилятор иначе тихо обошёл бы, не мемоизируя.
  reactHooks.configs.flat["recommended-latest"],
  // Vite Fast Refresh: модуль компонента экспортирует только компоненты (иначе HMR теряет стейт).
  reactRefresh.configs.vite,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      // Браузерное окружение (document, window) поверх node-глобалей из base.
      globals: { ...globals.browser },
    },
  },
  {
    // Роут-модули экспортируют `Route`, а компонент держат локально — премиса Fast-Refresh-правила
    // (файл экспортирует только компоненты) для file-based роутинга не выполняется; HMR роутов ведёт
    // сам router-плагин (autoCodeSplitting).
    files: ["src/routes/**/*.tsx"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
];
