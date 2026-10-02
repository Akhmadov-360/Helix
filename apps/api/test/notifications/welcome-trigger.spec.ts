import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp } from "../helpers/create-test-app";
import { clearMailhog, countMailhogMessages, waitForMailhogMessage } from "../helpers/mailhog";

describe("POST /v1/auth/register → welcome email (end-to-end)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp(undefined, { welcomeEmail: true });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await clearMailhog();
  });

  it("регистрация → приветственное письмо доходит именно новому пользователю со ссылкой на приложение", async () => {
    const email = "welcome-new@example.com";

    await request(app.getHttpServer())
      .post("/v1/auth/register")
      .send({ email, name: "Founder", password: "correct horse battery staple" })
      .expect(201);

    const message = await waitForMailhogMessage({ to: email });
    expect(message.To).toHaveLength(1);
    expect(message.Content.Body).toContain("localhost:5173");
  });

  it("неуспешная регистрация (дубликат email) не шлёт второе приветственное письмо", async () => {
    const email = "welcome-dup@example.com";
    const body = { email, name: "Founder", password: "correct horse battery staple" };

    await request(app.getHttpServer()).post("/v1/auth/register").send(body).expect(201);
    await waitForMailhogMessage({ to: email });
    await request(app.getHttpServer()).post("/v1/auth/register").send(body).expect(409);
    await new Promise((resolve) => setTimeout(resolve, 1000));

    expect(await countMailhogMessages({ to: email })).toBe(1);
  });
});
