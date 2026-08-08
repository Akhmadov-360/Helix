import type { INestApplication } from "@nestjs/common";
import type { Job } from "bullmq";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Env } from "@helix/config";
import { ENV } from "../../src/core/config/config.module";
import { EmailWorker } from "../../src/modules/notifications/email.worker";
import { MAILER, type MailerService } from "../../src/modules/notifications/mailer/mailer.interface";
import { NotificationsRepository } from "../../src/modules/notifications/notifications.repository";
import type { LeadCreatedJobData } from "../../src/modules/notifications/lead-created-job";
import { createTestApp } from "../helpers/create-test-app";

let counter = 0;

async function signUp(app: INestApplication): Promise<{ token: string; orgId: string }> {
  const email = `worker${counter++}@example.com`;
  const res = await request(app.getHttpServer())
    .post("/v1/auth/register")
    .send({ email, name: "Founder", password: "correct horse battery staple" })
    .expect(201);
  const token = res.body.data.accessToken as string;
  const orgId = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString()).activeOrgId;
  return { token, orgId };
}

async function clearMailhog(): Promise<void> {
  await fetch("http://localhost:8025/api/v1/messages", { method: "DELETE" });
}

async function mailhogMessageCount(): Promise<number> {
  const res = await fetch("http://localhost:8025/api/v2/messages");
  const body = (await res.json()) as { total: number };
  return body.total;
}

function fakeJob(data: LeadCreatedJobData): Job<LeadCreatedJobData> {
  return { data } as Job<LeadCreatedJobData>;
}

// §3: defensive re-check тенанта — процесс сам не доверяет job.data.orgId вслепую, а
// перепроверяет его в WHERE запроса. Тестируем process() напрямую (не через реальную
// очередь) — детерминированно, без гонок с BullMQ-таймингами.
describe("EmailWorker.process — tenant defensive re-check (§3)", () => {
  let app: INestApplication;
  let worker: EmailWorker;

  beforeAll(async () => {
    app = await createTestApp();
    worker = new EmailWorker(app.get(NotificationsRepository), app.get<MailerService>(MAILER), app.get<Env>(ENV));
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await clearMailhog();
  });

  it("projectId существует, но НЕ в переданной orgId → письмо не уходит", async () => {
    const owner = await signUp(app);
    const stranger = await signUp(app);

    const board = await request(app.getHttpServer())
      .post("/v1/workspaces")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ name: "Board" })
      .expect(201);
    const project = await request(app.getHttpServer())
      .post(`/v1/workspaces/${board.body.data.id}/projects`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ title: "Real lead" })
      .expect(201);

    // Настоящий лид создания сам уже поставил свой job в очередь (реальный триггер) —
    // ждём его обработку небольшим "settle", чтобы не спутать с job'ом из этого теста.
    await new Promise((r) => setTimeout(r, 300));
    await clearMailhog();

    await worker.process(fakeJob({ orgId: stranger.orgId, projectId: project.body.data.id }));

    expect(await mailhogMessageCount()).toBe(0);
  });
});
