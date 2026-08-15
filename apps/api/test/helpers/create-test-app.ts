import type { INestApplication } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test, type TestingModuleBuilder } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import { AppModule } from "../../src/app.module";

/**
 * Поднимает приложение с той же конфигурацией bootstrap, что и main.ts.
 *
 * Зачем отдельный хелпер: Test.createTestingModule НЕ применяет то, что настроено
 * в main.ts (глобальный префикс и т.п.). Без этого тесты били бы в /auth/register,
 * а прод отдавал /v1/auth/register — тесты были бы зелёными на несуществующем пути.
 * Одно место синхронизации вместо копипасты по файлам.
 *
 * `configure` — опциональный хук для overrideProvider (ai-chat.md §10: "реальные ответы реальных
 * LLM-провайдеров... не тестируем — только контракт адаптера через mock"). Без аргумента —
 * поведение не меняется, существующие тесты не задеты.
 */
export async function createTestApp(
  configure?: (builder: TestingModuleBuilder) => TestingModuleBuilder,
): Promise<INestApplication> {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (configure) builder = configure(builder);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();

  app.setGlobalPrefix("v1", { exclude: ["health"] });
  app.use(cookieParser());
  // main.ts parity — см. комментарий там (Express default 100kb < MAX_CONTENT_JSON_BYTES 256KB).
  app.useBodyParser("json", { limit: "1mb" });

  await app.init();
  return app;
}
