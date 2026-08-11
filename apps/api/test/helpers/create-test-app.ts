import type { INestApplication } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import { AppModule } from "../../src/app.module";

/**
 * Поднимает приложение с той же конфигурацией bootstrap, что и main.ts.
 *
 * Зачем отдельный хелпер: Test.createTestingModule НЕ применяет то, что настроено
 * в main.ts (глобальный префикс и т.п.). Без этого тесты били бы в /auth/register,
 * а прод отдавал /v1/auth/register — тесты были бы зелёными на несуществующем пути.
 * Одно место синхронизации вместо копипасты по файлам.
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();

  app.setGlobalPrefix("v1", { exclude: ["health"] });
  app.use(cookieParser());
  // main.ts parity — см. комментарий там (Express default 100kb < MAX_CONTENT_JSON_BYTES 256KB).
  app.useBodyParser("json", { limit: "1mb" });

  await app.init();
  return app;
}
