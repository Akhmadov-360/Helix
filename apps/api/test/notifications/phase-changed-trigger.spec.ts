import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@helix/db";
import { createTestApp } from "../helpers/create-test-app";
import { clearMailhog, waitForMailhogMessage } from "../helpers/mailhog";

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
    await request(app.getHttpServer())
      .post(`/v1/projects/${project.body.data.id}/assignees`)
      .set("Authorization", `Bearer ${token}`)
      .send({ userId: co.id })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/v1/projects/${project.body.data.id}/move`)
      .set("Authorization", `Bearer ${token}`)
      .send({ toPhaseId: wonPhaseId })
      .expect(200);

    const msg = await waitForMailhogMessage({ to: co.email, subject: "Won" });
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
    await request(app.getHttpServer())
      .post(`/v1/projects/${project.body.data.id}/assignees`)
      .set("Authorization", `Bearer ${token}`)
      .send({ userId: co.id })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/v1/projects/${project.body.data.id}/move`)
      .set("Authorization", `Bearer ${token}`)
      .send({ toPhaseId: toPhase!.id })
      .expect(200);

    const msg = await waitForMailhogMessage({ to: co.email, subject: "Phase changed" });
    expect(msg.Content.Headers["Subject"]?.[0]).toContain("Phase changed");
    expect(msg.Content.Body).toContain(fromPhase!.name.en ?? "");
    expect(msg.Content.Body).toContain(toPhase!.name.en ?? "");
  });
});
