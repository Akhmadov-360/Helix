import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";

/**
 * Shared flat ESLint config for the Helix monorepo.
 * Apps/packages extend this and add their own tsconfigRootDir / project globs.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/.turbo/**", "**/coverage/**", "**/node_modules/**", "**/generated/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      // CLAUDE.md: `any` только с явной причиной → запрещаем неявный, требуем ts-comment с описанием.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/ban-ts-comment": [
        "error",
        { "ts-expect-error": "allow-with-description" },
      ],
      // CLAUDE.md: никакого мёртвого кода. Неиспользуемое — ошибка; префикс _ = осознанно.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
    },
  },
  // Prettier last: turns off all formatting rules that would fight the formatter.
  prettier,
);
