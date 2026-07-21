import { execFileSync } from "node:child_process";
import { config as loadEnv } from "dotenv";

/**
 * Выполняется ОДИН раз за прогон (до всех тестовых файлов).
 * Накатывает миграции на тестовую БД: контейнер helix-test-db эфемерный (tmpfs),
 * поэтому после каждого `docker compose up` схемы там нет.
 *
 * `migrate deploy`, а не `migrate dev`: только применяет существующие миграции,
 * никогда не генерирует новые и не спрашивает интерактивно — правильный режим для CI.
 */
export default function setup(): void {
  const env = loadEnv({ path: ".env.test" }).parsed ?? {};
  const databaseUrl = env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is missing in apps/api/.env.test");
  }
  // Страховка от катастрофы: beforeEach делает TRUNCATE. Если сюда случайно
  // попадёт dev-БД (5433), тесты снесут рабочие данные. Лучше упасть.
  if (!databaseUrl.includes("5434")) {
    throw new Error(
      `Refusing to run tests: DATABASE_URL must point at the test DB on port 5434, got: ${databaseUrl}`,
    );
  }

  execFileSync(
    "pnpm",
    ["--filter", "@helix/db", "exec", "prisma", "migrate", "deploy"],
    { env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "inherit", shell: true },
  );
}
