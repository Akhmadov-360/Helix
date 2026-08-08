import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma, type Role } from "@helix/db";
import { createTestApp } from "../helpers/create-test-app";
import { seedSystemBlueprints } from "../helpers/seed-system-blueprints";

let counter = 0;

async function signUpAs(app: INestApplication, role: Role = "OWNER"): Promise<{ token: string; orgId: string }> {
  const email = `bp${counter++}@example.com`;
  const res = await request(app.getHttpServer())
    .post("/v1/auth/register")
    .send({ email, name: "Founder", password: "correct horse battery staple" })
    .expect(201);
  const token = res.body.data.accessToken as string;
  const orgId = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString()).activeOrgId;
  if (role !== "OWNER") await prisma.membership.updateMany({ where: { user: { email } }, data: { role } });
  return { token, orgId };
}

async function makeWorkspaceWithField(app: INestApplication, token: string): Promise<string> {
  const board = await request(app.getHttpServer())
    .post("/v1/workspaces")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "Board" })
    .expect(201);
  await request(app.getHttpServer())
    .post(`/v1/workspaces/${board.body.data.id}/fields`)
    .set("Authorization", `Bearer ${token}`)
    .send({ label: { en: "Budget" }, type: "currency" })
    .expect(201);
  return board.body.data.id as string;
}

describe("Blueprints CRUD (blueprints.md §1/§4/§6)", () => {
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

  describe("GET /v1/blueprints — видимость (§4)", () => {
    it("системные блюпринты видны свежей орге", async () => {
      const { token } = await signUpAs(app);
      const res = await request(app.getHttpServer())
        .get("/v1/blueprints")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      const ids = res.body.data.map((b: { id: string }) => b.id);
      expect(ids).toContain("bp-b2b-software-agency");
      expect(ids).toContain("bp-b2c-real-estate");
    });

    it("audience-фильтр сужает список верно", async () => {
      const { token } = await signUpAs(app);
      const res = await request(app.getHttpServer())
        .get("/v1/blueprints?audience=B2B")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body.data.every((b: { audience: string }) => b.audience === "B2B")).toBe(true);
      expect(res.body.data.map((b: { id: string }) => b.id)).toContain("bp-b2b-software-agency");
    });

    it("org-private блюпринт орги A НЕ виден орге B", async () => {
      const a = await signUpAs(app);
      const b = await signUpAs(app);
      const workspaceId = await makeWorkspaceWithField(app, a.token);
      const created = await request(app.getHttpServer())
        .post("/v1/blueprints")
        .set("Authorization", `Bearer ${a.token}`)
        .send({ workspaceId, name: "A's private blueprint", audience: "B2B" })
        .expect(201);

      const listB = await request(app.getHttpServer())
        .get("/v1/blueprints")
        .set("Authorization", `Bearer ${b.token}`)
        .expect(200);
      expect(listB.body.data.map((x: { id: string }) => x.id)).not.toContain(created.body.data.id);

      const listA = await request(app.getHttpServer())
        .get("/v1/blueprints")
        .set("Authorization", `Bearer ${a.token}`)
        .expect(200);
      expect(listA.body.data.map((x: { id: string }) => x.id)).toContain(created.body.data.id);
    });
  });

  describe("POST /v1/blueprints — save-as-blueprint (FR-BP-4)", () => {
    it("снапшот содержит фазы + поля с их key; правка исходного воркспейса потом его не трогает", async () => {
      const { token, orgId } = await signUpAs(app);
      const workspaceId = await makeWorkspaceWithField(app, token);

      const created = await request(app.getHttpServer())
        .post("/v1/blueprints")
        .set("Authorization", `Bearer ${token}`)
        .send({ workspaceId, name: "My pipeline", audience: "B2B" })
        .expect(201);

      expect(created.body.data.orgId).toBe(orgId);
      const definition = created.body.data.definition;
      expect(definition.phases).toHaveLength(4); // DEFAULT_PHASES
      expect(definition.phases.map((p: { key: string }) => p.key)).toEqual(["lead", "in-progress", "won", "lost"]);
      expect(definition.projectFields).toHaveLength(1);
      expect(definition.projectFields[0]).toMatchObject({ type: "currency", label: { en: "Budget" } });

      // Переименовать фазу в исходном воркспейсе — снапшот не должен измениться (не живая ссылка).
      const board = await request(app.getHttpServer())
        .get(`/v1/workspaces/${workspaceId}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      const firstPhaseId = board.body.data.phases[0].id;
      await request(app.getHttpServer())
        .patch(`/v1/phases/${firstPhaseId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ name: { en: "Renamed" } })
        .expect(200);

      const reread = await request(app.getHttpServer())
        .get("/v1/blueprints")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      const stillSnapshotted = reread.body.data.find((b: { id: string }) => b.id === created.body.data.id);
      expect(stillSnapshotted.definition.phases[0].name).toEqual({ en: "Lead", ru: "Лид", uz: "Lid" });
    });

    it("чужой workspaceId → 404", async () => {
      const owner = await signUpAs(app);
      const stranger = await signUpAs(app);
      const workspaceId = await makeWorkspaceWithField(app, owner.token);

      await request(app.getHttpServer())
        .post("/v1/blueprints")
        .set("Authorization", `Bearer ${stranger.token}`)
        .send({ workspaceId, name: "Stolen", audience: "B2B" })
        .expect(404);
    });
  });

  describe("DELETE /v1/blueprints/:id — только свой org-private (§6)", () => {
    it("удаляет свой org-private блюпринт", async () => {
      const { token } = await signUpAs(app);
      const workspaceId = await makeWorkspaceWithField(app, token);
      const created = await request(app.getHttpServer())
        .post("/v1/blueprints")
        .set("Authorization", `Bearer ${token}`)
        .send({ workspaceId, name: "Disposable", audience: "B2B" })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/v1/blueprints/${created.body.data.id}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
    });

    it("системный блюпринт → 404 (не удаляется через API вообще)", async () => {
      const { token } = await signUpAs(app);
      await request(app.getHttpServer())
        .delete("/v1/blueprints/bp-b2b-software-agency")
        .set("Authorization", `Bearer ${token}`)
        .expect(404);
    });

    it("org-private блюпринт чужой орги → 404, не 403 (IDOR)", async () => {
      const a = await signUpAs(app);
      const b = await signUpAs(app);
      const workspaceId = await makeWorkspaceWithField(app, a.token);
      const created = await request(app.getHttpServer())
        .post("/v1/blueprints")
        .set("Authorization", `Bearer ${a.token}`)
        .send({ workspaceId, name: "A's", audience: "B2B" })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/v1/blueprints/${created.body.data.id}`)
        .set("Authorization", `Bearer ${b.token}`)
        .expect(404);
    });
  });

  describe("RBAC (§6) — Manage blueprints = O/A only, read = все", () => {
    it("MANAGER читает список (200), но не может создать (403 — CheckPolicy до сервиса)", async () => {
      const { token } = await signUpAs(app, "MANAGER");
      await request(app.getHttpServer()).get("/v1/blueprints").set("Authorization", `Bearer ${token}`).expect(200);

      await request(app.getHttpServer())
        .post("/v1/blueprints")
        .set("Authorization", `Bearer ${token}`)
        .send({ workspaceId: "any", name: "x", audience: "B2B" })
        .expect(403);
    });

    it("MEMBER читает список (200), но не может создать (403)", async () => {
      const { token } = await signUpAs(app, "MEMBER");
      await request(app.getHttpServer()).get("/v1/blueprints").set("Authorization", `Bearer ${token}`).expect(200);
      await request(app.getHttpServer())
        .post("/v1/blueprints")
        .set("Authorization", `Bearer ${token}`)
        .send({ workspaceId: "any", name: "x", audience: "B2B" })
        .expect(403);
    });
  });
});
