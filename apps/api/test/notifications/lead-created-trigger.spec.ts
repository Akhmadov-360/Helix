import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp } from "../helpers/create-test-app";

let counter = 0;

async function signUp(app: INestApplication): Promise<{ token: string }> {
  const email = `trigger${counter++}@example.com`;
  const res = await request(app.getHttpServer())
    .post("/v1/auth/register")
    .send({ email, name: "Founder", password: "correct horse battery staple" })
    .expect(201);
  return { token: res.body.data.accessToken as string };
}

async function clearMailhog(): Promise<void> {
  await fetch("http://localhost:8025/api/v1/messages", { method: "DELETE" });
}

interface MailhogMessage {
  To: { Mailbox: string; Domain: string }[];
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

// Полный путь end-to-end (notifications.md §1): POST создаёт лид → ProjectsService.create()
// зовёт NotificationsService.enqueueLeadCreated → реальный BullMQ (Redis) → реальный EmailWorker →
// реальный SmtpMailerService → MailHog. Ничего не мокается — тот же принцип, что smtp-mailer.spec.ts.
describe("POST /v1/workspaces/:id/projects → lead.created email (end-to-end)", () => {
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

  it("новый лид без явного owner → письмо доходит создателю (дефолт-владельцу)", async () => {
    const { token } = await signUp(app);
    const board = await request(app.getHttpServer())
      .post("/v1/workspaces")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Board" })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/v1/workspaces/${board.body.data.id}/projects`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Acme Corp deal" })
      .expect(201);

    const msg = await waitForMailhogMessage();
    expect(msg.Content.Headers["Subject"]?.[0]).toContain("Acme Corp deal");
    expect(msg.Content.Body).toContain("/contacts");
  });
});
