import "reflect-metadata";
import "dotenv/config"; // грузим apps/api/.env ДО чтения env и создания PrismaClient
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import { getEnv } from "@helix/config";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  // Валидация env на старте: бросит с читаемым списком проблем при невалидном.
  getEnv();

  const app = await NestFactory.create(AppModule);

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
