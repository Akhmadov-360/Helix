import { execFileSync } from "node:child_process";
import { Queue } from "bullmq";
import { config as loadEnv } from "dotenv";
import { EMAIL_QUEUE, INGEST_EMBEDDINGS_QUEUE, MAINTENANCE_QUEUE } from "../src/core/queue/queue.module";

/**
 * Выполняется ОДИН раз за прогон (до всех тестовых файлов).
 * Накатывает миграции на тестовую БД: контейнер helix-test-db эфемерный (tmpfs),
 * поэтому после каждого `docker compose up` схемы там нет.
 *
 * `migrate deploy`, а не `migrate dev`: только применяет существующие миграции,
 * никогда не генерирует новые и не спрашивает интерактивно — правильный режим для CI.
 */
export default async function setup(): Promise<void> {
  const env = loadEnv({ path: ".env.test" }).parsed ?? {};
  const databaseUrl = env.DATABASE_URL;
  const redisUrl = env.REDIS_URL;

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

  await clearTestQueues(redisUrl);
}

// Очереди переживают прогон: недоработанные job'ы прошлых запусков подхватываются новым воркером
// и шлют письма по уже стёртым TRUNCATE данным. Dev использует logical DB /0 с теми же именами
// очередей (в т.ч. repeatable cleanup-job'ы) — туда не лезем.
async function clearTestQueues(redisUrl: string | undefined): Promise<void> {
  if (!redisUrl) {
    throw new Error("REDIS_URL is missing in apps/api/.env.test");
  }
  if (!/\/[1-9]\d*$/.test(redisUrl)) {
    throw new Error(`Refusing to clear queues: REDIS_URL must use a non-zero logical DB (dev uses /0), got: ${redisUrl}`);
  }

  for (const name of [EMAIL_QUEUE, INGEST_EMBEDDINGS_QUEUE, MAINTENANCE_QUEUE]) {
    const queue = new Queue(name, { connection: { url: redisUrl } });
    await queue.obliterate({ force: true });
    await queue.close();
  }
}
