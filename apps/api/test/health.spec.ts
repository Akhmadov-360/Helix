import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";

/**
 * Smoke-тест каркаса: поднимает РЕАЛЬНОЕ Nest-приложение (не мок).
 * Проверяет разом четыре вещи, каждая из которых могла бы молча не работать:
 *  1) DI резолвится → SWC отдал decorator metadata;
 *  2) ResponseTransformInterceptor обернул ответ в ApiResponse<T>;
 *  3) PrismaService подключился к ТЕСТОВОЙ БД;
 *  4) роут /health не уехал под глобальный префикс /v1.
 */
describe("GET /health", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("возвращает конверт ApiResponse с живой БД", async () => {
    const res = await request(app.getHttpServer()).get("/health").expect(200);

    expect(res.body).toMatchObject({
      success: true,
      data: { status: "ok", db: "up" },
    });
    expect(typeof res.body.timestamp).toBe("string");
  });

  it("неизвестный роут отдаёт error-конверт, а не голый 404", async () => {
    const res = await request(app.getHttpServer()).get("/v1/does-not-exist").expect(404);

    expect(res.body).toMatchObject({
      success: false,
      error: { code: "HTTP_ERROR" },
    });
  });
});
