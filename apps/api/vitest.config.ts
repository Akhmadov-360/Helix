import { configDefaults, defineConfig } from "vitest/config";
import swc from "unplugin-swc";
import { config as loadEnv } from "dotenv";

// Env для тестов грузим здесь, а НЕ в setupFiles: singleton PrismaClient в @helix/db
// создаётся в момент импорта модуля, поэтому DATABASE_URL обязан стоять в process.env
// раньше, чем тестовый файл что-либо импортирует. Конфиг вычисляется до всего.
const testEnv = loadEnv({ path: ".env.test" }).parsed ?? {};

// Vitest трансформирует TS через esbuild, а он НЕ эмитит decorator metadata.
// Без SWC с decoratorMetadata Nest DI в тестах не резолвит зависимости.
const swcPlugin = () =>
  swc.vite({
    module: { type: "es6" },
    jsc: {
      target: "es2022",
      parser: { syntax: "typescript", decorators: true },
      transform: { legacyDecorator: true, decoratorMetadata: true },
    },
  });

export default defineConfig({
  test: {
    // Тестовая БД одна на прогон, изоляция — через TRUNCATE в beforeEach.
    // Параллельные файлы затирали бы данные друг друга (и ловили deadlock на TRUNCATE) → выключаем.
    // Опция читается только на корневом уровне, внутри projects она игнорируется;
    // unit-прогон включает параллелизм обратно флагом в скрипте test:unit.
    fileParallelism: false,
    projects: [
      {
        plugins: [swcPlugin()],
        test: {
          name: "unit",
          environment: "node",
          include: ["test/**/*.unit.spec.ts", "src/**/*.unit.spec.ts"],
          env: testEnv,
        },
      },
      {
        plugins: [swcPlugin()],
        test: {
          name: "integration",
          environment: "node",
          include: ["test/**/*.spec.ts", "src/**/*.spec.ts"],
          exclude: [...configDefaults.exclude, "**/*.unit.spec.ts"],
          env: testEnv,
          globalSetup: ["./test/global-setup.ts"],
          setupFiles: ["./test/setup.ts"],
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
