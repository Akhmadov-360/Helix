import { z } from "zod";
import { envSchema, type Env } from "./env.schema";

export { envSchema };
export type { Env };

/**
 * Валидирует источник env (по умолчанию process.env) и возвращает типизированный
 * объект. Бросает с читаемым списком проблем при невалидном env.
 *
 * Чистая функция без сайд-эффектов чтения файлов: dotenv-загрузка — забота
 * точки входа приложения (apps/api), не этого пакета. Так пакет тестируется и
 * переиспользуется (CLI, воркеры) без привязки к рантайму.
 */
export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const issues = z.flattenError(result.error).fieldErrors;
    const lines = Object.entries(issues)
      .map(([key, msgs]) => `  - ${key}: ${(msgs ?? []).join(", ")}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${lines}`);
  }

  return result.data;
}

/**
 * Ленивый валидированный синглтон. Первое обращение парсит process.env и падает
 * на старте при невалидном env (требование: "падает на старте").
 */
let cached: Env | undefined;
export function getEnv(): Env {
  cached ??= parseEnv();
  return cached;
}
