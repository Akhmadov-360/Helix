import base from "@helix/eslint-config";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...base,
  {
    files: ["**/*.ts"],
    rules: {
      // Nest DI резолвит зависимости по runtime-метаданным типа (emitDecoratorMetadata).
      // consistent-type-imports не видит это использование и ложно требует `import type`
      // для инъектируемых классов (напр. PrismaService), что ломает DI. Отключаем в API.
      "@typescript-eslint/consistent-type-imports": "off",
    },
  },
];
