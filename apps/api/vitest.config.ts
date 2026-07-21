import { defineConfig } from "vitest/config";
import swc from "unplugin-swc";
import { config as loadEnv } from "dotenv";

// Env для тестов грузим здесь, а НЕ в setupFiles: singleton PrismaClient в @helix/db
// создаётся в момент импорта модуля, поэтому DATABASE_URL обязан стоять в process.env
// раньше, чем тестовый файл что-либо импортирует. Конфиг вычисляется до всего.
const testEnv = loadEnv({ path: ".env.test" }).parsed ?? {};

export default defineConfig({
  plugins: [
    // Vitest трансформирует TS через esbuild, а он НЕ эмитит decorator metadata.
    // Без SWC с decoratorMetadata Nest DI в тестах не резолвит зависимости.
    swc.vite({
      module: { type: "es6" },
      jsc: {
        target: "es2022",
        parser: { syntax: "typescript", decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
  test: {
    environment: "node",
    include: ["test/**/*.spec.ts", "src/**/*.spec.ts"],
    env: testEnv,
    globalSetup: ["./test/global-setup.ts"],
    setupFiles: ["./test/setup.ts"],
    // Тестовая БД одна на прогон, изоляция — через TRUNCATE в beforeEach.
    // Параллельные файлы затирали бы данные друг друга → выключаем параллелизм.
    // Цена: линейное время прогона. Альтернатива (схема на воркер) — когда станет больно.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
