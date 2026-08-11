import "reflect-metadata";
import "dotenv/config"; // грузим apps/api/.env ДО чтения env и создания PrismaClient
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import { getEnv } from "@helix/config";
import { AppModule } from "./app.module";

// Express body-parser дефолтит на 100kb — ниже MAX_CONTENT_JSON_BYTES (pages-kb.md §5, 256KB):
// без явного лимита Page.content между 100KB и 256KB падал бы необработанным 500
// (PayloadTooLargeError до Zod), а не документированным 400 при превышении лимита контракта.
const JSON_BODY_LIMIT = "1mb";

async function bootstrap(): Promise<void> {
  // Валидация env на старте: бросит с читаемым списком проблем при невалидном.
  const env = getEnv();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useBodyParser("json", { limit: JSON_BODY_LIMIT });

  // apps/web — отдельный origin (5173 vs 3000); credentials: true нужен для refresh-cookie.
  app.enableCors({ origin: env.WEB_ORIGIN, credentials: true });

  // Все контроллеры под /v1 (FR-API-1). Health остаётся на /health.
  app.setGlobalPrefix("v1", { exclude: ["health"] });
  // Нужен, чтобы прочитать httpOnly refresh-cookie на /v1/auth/refresh.
  app.use(cookieParser());
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Helix API")
    .setDescription("Helix — AI-native project-based CRM")
    .setVersion("0.0.0")
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("docs", app, document);

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  Logger.log(`Helix API → http://localhost:${port}  (docs: /docs)`, "Bootstrap");
}

void bootstrap();
