import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@helix/db";
import { createTestApp } from "../helpers/create-test-app";

let counter = 0;

async function signUp(app: INestApplication): Promise<{ token: string; orgId: string }> {
  const email = `ptrig${counter++}@example.com`;
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

// Полный путь end-to-end, тот же принцип, что lead-created-trigger.spec.ts: ProjectsService.move()
// → NotificationsService.enqueuePhaseChanged → реальный BullMQ → EmailWorker → SmtpMailerService → MailHog.
describe("POST /v1/projects/:id/move → project.phase_changed email (end-to-end)", () => {
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

  it("move в фазу WON → письмо доходит assignee, НЕ actor'у (owner), который подвинул карточку", async () => {
    const { token, orgId } = await signUp(app);
    const co = await prisma.user.create({
      data: { email: `pco${counter++}@example.com`, name: "Coworker", passwordHash: "x" },
    });
    await prisma.membership.create({ data: { orgId, userId: co.id, role: "MEMBER" } });

    const board = await request(app.getHttpServer())
      .post("/v1/workspaces")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Board" })
      .expect(201);
    const phases = board.body.data.phases as { id: string; type: string }[];
    const wonPhaseId = phases.find((p) => p.type === "WON")!.id;

    const project = await request(app.getHttpServer())
      .post(`/v1/workspaces/${board.body.data.id}/projects`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Acme Corp deal" })
      .expect(201);
    await waitForMailhogMessage(); // lead.created
    await clearMailhog();

    await request(app.getHttpServer())
      .post(`/v1/projects/${project.body.data.id}/assignees`)
      .set("Authorization", `Bearer ${token}`)
      .send({ userId: co.id })
      .expect(201);
    await waitForMailhogMessage(); // project.assigned
    await clearMailhog(); // теперь интересует только won-письмо

    await request(app.getHttpServer())
      .post(`/v1/projects/${project.body.data.id}/move`)
      .set("Authorization", `Bearer ${token}`)
      .send({ toPhaseId: wonPhaseId })
      .expect(200);

    const msg = await waitForMailhogMessage();
    expect(msg.To).toHaveLength(1); // owner === actor исключён, остаётся только assignee
    expect(msg.To[0]?.Mailbox).toBe(co.email.split("@")[0]);
    expect(msg.Content.Headers["Subject"]?.[0]).toContain("Won");
    expect(msg.Content.Body).toContain("Acme Corp deal");
    expect(msg.Content.Body).toContain("/activity");
  });

  it("move между двумя OPEN-фазами → письмо с обеими фазами в тексте", async () => {
    const { token, orgId } = await signUp(app);
    const co = await prisma.user.create({
      data: { email: `pco${counter++}@example.com`, name: "Coworker", passwordHash: "x" },
    });
    await prisma.membership.create({ data: { orgId, userId: co.id, role: "MEMBER" } });

    const board = await request(app.getHttpServer())
      .post("/v1/workspaces")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Board" })
      .expect(201);
    const phases = board.body.data.phases as { id: string; type: string; name: { en?: string } }[];
    const openPhases = phases.filter((p) => p.type === "OPEN");
    const [fromPhase, toPhase] = openPhases; // новый проект всегда попадает в первую фазу доски (см. createProjectSchema)

    const project = await request(app.getHttpServer())
      .post(`/v1/workspaces/${board.body.data.id}/projects`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Beta Inc deal" })
      .expect(201);
    await waitForMailhogMessage(); // lead.created
    await clearMailhog();

    await request(app.getHttpServer())
      .post(`/v1/projects/${project.body.data.id}/assignees`)
      .set("Authorization", `Bearer ${token}`)
      .send({ userId: co.id })
      .expect(201);
    await waitForMailhogMessage(); // project.assigned
    await clearMailhog();

    await request(app.getHttpServer())
      .post(`/v1/projects/${project.body.data.id}/move`)
      .set("Authorization", `Bearer ${token}`)
      .send({ toPhaseId: toPhase!.id })
      .expect(200);

    const msg = await waitForMailhogMessage();
    expect(msg.Content.Headers["Subject"]?.[0]).toContain("Phase changed");
    expect(msg.Content.Body).toContain(fromPhase!.name.en ?? "");
    expect(msg.Content.Body).toContain(toPhase!.name.en ?? "");
  });
});
