import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@helix/db";
import { createTestApp } from "../helpers/create-test-app";

let counter = 0;

async function signUp(app: INestApplication): Promise<{ token: string; orgId: string; userId: string }> {
  const email = `tatrig${counter++}@example.com`;
  const res = await request(app.getHttpServer())
    .post("/v1/auth/register")
    .send({ email, name: "Founder", password: "correct horse battery staple" })
    .expect(201);
  const token = res.body.data.accessToken as string;
  const claims = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString());
  return { token, orgId: claims.activeOrgId, userId: claims.sub };
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

async function countMailhogMessages(): Promise<number> {
  const res = await fetch("http://localhost:8025/api/v2/messages");
  const body = (await res.json()) as { total: number };
  return body.total;
}

// End-to-end: TasksService.create/update с assigneeId ≠ actorId → NotificationsService.enqueueTaskAssigned
// → BullMQ → EmailWorker.processTaskAssigned → MailerService → MailHog. Тот же паттерн что
// assignment-trigger.spec.ts (project-assigned), но для чекпоинта TASK-level.
describe("Task assignment → task.assigned email (end-to-end)", () => {
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

  it("создание таска с assigneeId другого юзера → письмо назначенному", async () => {
    const { token, orgId, userId } = await signUp(app);
    const co = await prisma.user.create({
      data: { email: `co${counter++}@example.com`, name: "Coworker", passwordHash: "x" },
    });
    await prisma.membership.create({ data: { orgId, userId: co.id, role: "MEMBER" } });

    const ws = (
      await request(app.getHttpServer()).post("/v1/workspaces").set("Authorization", `Bearer ${token}`).send({ name: "B" }).expect(201)
    ).body.data;
    const project = (
      await request(app.getHttpServer())
        .post(`/v1/workspaces/${ws.id}/projects`)
        .set("Authorization", `Bearer ${token}`)
        .send({ title: "Acme Corp deal" })
        .expect(201)
    ).body.data;

    // Дождаться и убрать lead.created (project.created) письмо перед проверкой task.assigned
    await waitForMailhogMessage();
    await clearMailhog();

    await request(app.getHttpServer())
      .post(`/v1/projects/${project.id}/tasks`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Call the CTO", dueAt: "2026-09-20T12:00:00.000Z", assigneeId: co.id })
      .expect(201);

    const msg = await waitForMailhogMessage();
    expect(msg.To[0]?.Mailbox).toBe(co.email.split("@")[0]);
    expect(msg.Content.Headers["Subject"]?.[0]).toContain("Call the CTO");
    // deep-link ведёт на Tasks-таб этого проекта
    expect(msg.Content.Body).toContain(`/projects/${project.id}/tasks`);
    // actorName попал в шаблон (Founder — имя из signUp)
    expect(msg.Content.Body).toContain("Founder");
    // suppress unused warning + документирует intent
    void userId;
  });

  it("self-assign (assigneeId === actorId) → письма НЕТ", async () => {
    const { token, userId } = await signUp(app);
    const ws = (
      await request(app.getHttpServer()).post("/v1/workspaces").set("Authorization", `Bearer ${token}`).send({ name: "B" }).expect(201)
    ).body.data;
    const project = (
      await request(app.getHttpServer())
        .post(`/v1/workspaces/${ws.id}/projects`)
        .set("Authorization", `Bearer ${token}`)
        .send({ title: "Self-deal" })
        .expect(201)
    ).body.data;

    await waitForMailhogMessage(); // lead.created
    await clearMailhog();

    await request(app.getHttpServer())
      .post(`/v1/projects/${project.id}/tasks`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "My own task", assigneeId: userId })
      .expect(201);

    // Даём воркеру шанс обработать: если бы job был enqueued, за 1сек он бы уже отправил (mailhog inbox быстрый).
    // Явное ожидание = window наблюдения: за это время НЕ должно появиться сообщений.
    await new Promise((r) => setTimeout(r, 1000));
    expect(await countMailhogMessages()).toBe(0);
  });

  it("PATCH: смена assignee с одного на другого → письмо новому", async () => {
    const { token, orgId } = await signUp(app);
    const [a, b] = await Promise.all([
      prisma.user.create({ data: { email: `a${counter++}@x.com`, name: "Alice", passwordHash: "x" } }),
      prisma.user.create({ data: { email: `b${counter++}@x.com`, name: "Bob", passwordHash: "x" } }),
    ]);
    await Promise.all([
      prisma.membership.create({ data: { orgId, userId: a.id, role: "MEMBER" } }),
      prisma.membership.create({ data: { orgId, userId: b.id, role: "MEMBER" } }),
    ]);

    const ws = (
      await request(app.getHttpServer()).post("/v1/workspaces").set("Authorization", `Bearer ${token}`).send({ name: "B" }).expect(201)
    ).body.data;
    const project = (
      await request(app.getHttpServer())
        .post(`/v1/workspaces/${ws.id}/projects`)
        .set("Authorization", `Bearer ${token}`)
        .send({ title: "Reassign flow" })
        .expect(201)
    ).body.data;

    // Создание с assignee=Alice: письмо ей + lead.created — оба уйдут; ждём одно
    await waitForMailhogMessage();
    // Пропускаем оба (простой способ — ждём чуть больше и чистим)
    await new Promise((r) => setTimeout(r, 500));
    await clearMailhog();

    const task = (
      await request(app.getHttpServer())
        .post(`/v1/projects/${project.id}/tasks`)
        .set("Authorization", `Bearer ${token}`)
        .send({ title: "Follow up", assigneeId: a.id })
        .expect(201)
    ).body.data;

    await new Promise((r) => setTimeout(r, 500));
    await clearMailhog();

    // Переназначение на Bob
    await request(app.getHttpServer())
      .patch(`/v1/tasks/${task.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ assigneeId: b.id })
      .expect(200);

    const msg = await waitForMailhogMessage();
    expect(msg.To[0]?.Mailbox).toBe(b.email.split("@")[0]);
    expect(msg.Content.Headers["Subject"]?.[0]).toContain("Follow up");
  });
});
