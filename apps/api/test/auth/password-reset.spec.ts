import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { createTestApp } from "../helpers/create-test-app";

let counter = 0;

async function clearMailhog(): Promise<void> {
  await fetch("http://localhost:8025/api/v1/messages", { method: "DELETE" });
}

interface MailhogMessage {
  Content: { Headers: Record<string, string[]>; Body: string };
}

async function waitForMailhogMessage(timeoutMs = 5000): Promise<MailhogMessage> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch("http://localhost:8025/api/v2/messages");
    const body = (await res.json()) as { items: MailhogMessage[] };
    if (body.items.length > 0) return body.items[0]!;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Timed out waiting for MailHog message");
}

function extractToken(body: string): string {
  // MailHog кодирует тело письма в quoted-printable — "=3D" это "=".
  const match = /token=3D([A-Za-z0-9_-]+)/.exec(body) ?? /token=([A-Za-z0-9_-]+)/.exec(body);
  if (!match?.[1]) throw new Error(`No reset token found in email body: ${body}`);
  return match[1];
}

// Полный путь end-to-end, тот же принцип, что lead-created-trigger.spec.ts: ничего не мокается —
// реальный BullMQ → реальный EmailWorker → реальный SmtpMailerService → MailHog.
describe("POST /v1/auth/forgot-password + /v1/auth/reset-password (end-to-end)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await clearMailhog();
  });

  it("полный флоу: запрос → письмо → сброс → старый пароль не работает, новый работает", async () => {
    const email = `reset${counter++}@example.com`;
    await request(app.getHttpServer())
      .post("/v1/auth/register")
      .send({ email, name: "Founder", password: "correct horse battery staple" })
      .expect(201);

    await request(app.getHttpServer())
      .post("/v1/auth/forgot-password")
      .send({ email })
      .expect(200);

    const msg = await waitForMailhogMessage();
    const token = extractToken(msg.Content.Body);

    await request(app.getHttpServer())
      .post("/v1/auth/reset-password")
      .send({ token, newPassword: "a brand new correct horse battery" })
      .expect(200);

    await request(app.getHttpServer())
      .post("/v1/auth/login")
      .send({ email, password: "correct horse battery staple" })
      .expect(401);

    await request(app.getHttpServer())
      .post("/v1/auth/login")
      .send({ email, password: "a brand new correct horse battery" })
      .expect(200);
  });

  it("несуществующий email → всё равно 200 (не оракул существования аккаунта)", async () => {
    await request(app.getHttpServer())
      .post("/v1/auth/forgot-password")
      .send({ email: "nobody-here@example.com" })
      .expect(200);
  });

  it("сброс отзывает refresh-сессии: старая cookie после сброса больше не рефрешится", async () => {
    const email = `reset${counter++}@example.com`;
    const registerRes = await request(app.getHttpServer())
      .post("/v1/auth/register")
      .send({ email, name: "Founder", password: "correct horse battery staple" })
      .expect(201);
    const refreshCookie = registerRes.headers["set-cookie"] as string[] | undefined;
    if (!refreshCookie) throw new Error("register did not set a refresh cookie");

    await request(app.getHttpServer()).post("/v1/auth/forgot-password").send({ email }).expect(200);
    const msg = await waitForMailhogMessage();
    const token = extractToken(msg.Content.Body);

    await request(app.getHttpServer())
      .post("/v1/auth/reset-password")
      .send({ token, newPassword: "a brand new correct horse battery" })
      .expect(200);

    await request(app.getHttpServer())
      .post("/v1/auth/refresh")
      .set("Cookie", refreshCookie)
      .expect(401);
  });

  it("уже использованный/несуществующий токен → 401", async () => {
    await request(app.getHttpServer())
      .post("/v1/auth/reset-password")
      .send({ token: "not-a-real-token", newPassword: "a brand new correct horse battery" })
      .expect(401);
  });
});
