import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@helix/db";
import { createTestApp } from "../helpers/create-test-app";
import { seedSystemBlueprints } from "../helpers/seed-system-blueprints";

let counter = 0;

async function signUp(app: INestApplication): Promise<{ token: string; orgId: string }> {
  const email = `inst${counter++}@example.com`;
  const res = await request(app.getHttpServer())
    .post("/v1/auth/register")
    .send({ email, name: "Founder", password: "correct horse battery staple" })
    .expect(201);
  const token = res.body.data.accessToken as string;
  const orgId = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString()).activeOrgId;
  return { token, orgId };
}

describe("POST /v1/workspaces { blueprintId } — инстанцирование (blueprints.md §3)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await seedSystemBlueprints();
  });

  afterAll(async () => {
    await app.close();
  });

  it("без blueprintId — поведение НЕ изменилось (регрессия на DEFAULT_PHASES)", async () => {
    const { token } = await signUp(app);
    const res = await request(app.getHttpServer())
      .post("/v1/workspaces")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Board" })
      .expect(201);

    expect(res.body.data.phases.map((p: { key: string }) => p.key)).toEqual(["lead", "in-progress", "won", "lost"]);
  });

  it("с blueprintId — фазы/поля ИМЕННО из definition, key буквально из блюпринта", async () => {
    const { token } = await signUp(app);
    const res = await request(app.getHttpServer())
      .post("/v1/workspaces")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Agency Board", blueprintId: "bp-b2b-software-agency" })
      .expect(201);

    expect(res.body.data.phases.map((p: { key: string }) => p.key)).toEqual([
      "call_request",
      "discovery",
      "planning",
      "contract",
      "won",
      "lost",
    ]);

    const fields = await request(app.getHttpServer())
      .get(`/v1/workspaces/${res.body.data.id}/fields`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(fields.body.data.map((f: { key: string }) => f.key).sort()).toEqual(["budget", "target_start", "tech_stack"]);
  });

  it("audience блюпринта побеждает, если запрос не переопределил", async () => {
    const { token } = await signUp(app);
    const res = await request(app.getHttpServer())
      .post("/v1/workspaces")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Board", blueprintId: "bp-b2c-real-estate" })
      .expect(201);
    expect(res.body.data.audience).toBe("B2C");
  });

  it("явный audience в запросе переопределяет audience блюпринта", async () => {
    const { token } = await signUp(app);
    const res = await request(app.getHttpServer())
      .post("/v1/workspaces")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Board", audience: "MIXED", blueprintId: "bp-b2c-real-estate" })
      .expect(201);
    expect(res.body.data.audience).toBe("MIXED");
  });

  it("notificationDefaults материализуется в settings.notifications", async () => {
    const { token } = await signUp(app);
    const res = await request(app.getHttpServer())
      .post("/v1/workspaces")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Board", blueprintId: "bp-b2c-real-estate" })
      .expect(201);
    // bp-b2c-real-estate: { newLead: { email: true, recipients: ["owner"] } }
    expect(res.body.data.settings.notifications).toEqual({ newLead: { email: true, recipients: ["owner"] } });
  });

  it("чужой org-private блюпринт по id → 404", async () => {
    const owner = await signUp(app);
    const stranger = await signUp(app);
    const board = await request(app.getHttpServer())
      .post("/v1/workspaces")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ name: "Source" })
      .expect(201);
    const bp = await request(app.getHttpServer())
      .post("/v1/blueprints")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ workspaceId: board.body.data.id, name: "Private", audience: "B2B" })
      .expect(201);

    await request(app.getHttpServer())
      .post("/v1/workspaces")
      .set("Authorization", `Bearer ${stranger.token}`)
      .send({ name: "Steal attempt", blueprintId: bp.body.data.id })
      .expect(404);
  });

  it("несуществующий blueprintId → 404", async () => {
    const { token } = await signUp(app);
    await request(app.getHttpServer())
      .post("/v1/workspaces")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Board", blueprintId: "does-not-exist" })
      .expect(404);
  });

  it("атомарность: невалидный блюпринт (дубль field key) → воркспейс НЕ создаётся частично", async () => {
    const { token, orgId } = await signUp(app);
    // Сконструирован напрямую в БД (не через API — API/Zod не даст создать такой снапшот сам):
    // проверяем, что транзакция откатывается на уровне БД, а не что валидация где-то пропущена.
    await prisma.blueprint.create({
      data: {
        id: `bp-broken-${counter++}`,
        orgId: null,
        audience: "B2B",
        name: "Broken",
        definition: {
          phases: [{ key: "lead", name: { en: "Lead" }, type: "OPEN", order: 1 }],
          projectFields: [
            { key: "dup", label: { en: "A" }, type: "text" },
            { key: "dup", label: { en: "B" }, type: "text" },
          ],
        },
      },
    });
    const brokenId = (await prisma.blueprint.findFirst({ where: { name: "Broken" }, orderBy: { createdAt: "desc" } }))!.id;

    const before = await prisma.workspace.count({ where: { orgId } });
    await request(app.getHttpServer())
      .post("/v1/workspaces")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Should not exist", blueprintId: brokenId })
      .expect(409); // UNIQUE_VIOLATION — all-exceptions.filter.ts P2002 → 409

    const after = await prisma.workspace.count({ where: { orgId } });
    expect(after).toBe(before);
  });
});
