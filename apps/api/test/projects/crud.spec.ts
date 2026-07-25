import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@helix/db";
import { createTestApp } from "../helpers/create-test-app";

let counter = 0;

async function signUp(app: INestApplication): Promise<{ token: string; orgId: string; userId: string }> {
  const email = `crud${counter++}@example.com`;
  const res = await request(app.getHttpServer())
    .post("/v1/auth/register")
    .send({ email, name: "Crud", password: "correct horse battery staple" })
    .expect(201);
  const token = res.body.data.accessToken as string;
  const claims = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString());
  return { token, orgId: claims.activeOrgId, userId: claims.sub };
}

describe("project CRUD (§1, units 10-11)", () => {
  let app: INestApplication;
  let token: string;
  let orgId: string;
  let userId: string;
  let wsId: string;
  let phaseIds: string[];

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    const u = await signUp(app);
    token = u.token;
    orgId = u.orgId;
    userId = u.userId;
    const res = await request(app.getHttpServer())
      .post("/v1/workspaces")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Board" })
      .expect(201);
    wsId = res.body.data.id;
    phaseIds = res.body.data.phases.map((p: { id: string }) => p.id);
  });

  const seed = (rank: string, data: Record<string, unknown> = {}) =>
    prisma.project.create({
      data: { orgId, workspaceId: wsId, phaseId: phaseIds[0]!, title: "P", rank, status: "OPEN", ...data },
    });

  const get = (id: string) =>
    request(app.getHttpServer()).get(`/v1/projects/${id}`).set("Authorization", `Bearer ${token}`);
  const patch = (id: string) =>
    request(app.getHttpServer()).patch(`/v1/projects/${id}`).set("Authorization", `Bearer ${token}`);
  const del = (id: string) =>
    request(app.getHttpServer()).delete(`/v1/projects/${id}`).set("Authorization", `Bearer ${token}`);
  const eventCount = (projectId: string, type: string) =>
    prisma.activityEvent.count({ where: { projectId, type } });

  describe("GET /:id", () => {
    it("возвращает проект по id", async () => {
      const p = await seed("a0", { value: 100, currency: "USD" });
      const res = await get(p.id).expect(200);
      expect(res.body.data.id).toBe(p.id);
      expect(res.body.data.value).toBe(100);
      expect(res.body.data.currency).toBe("USD");
    });

    it("несуществующий → 404", async () => {
      await get("00000000-0000-0000-0000-000000000000").expect(404);
    });

    it("чужой проект → 404 (tenant-скоуп)", async () => {
      const p = await seed("a0");
      const stranger = await signUp(app);
      await request(app.getHttpServer())
        .get(`/v1/projects/${p.id}`)
        .set("Authorization", `Bearer ${stranger.token}`)
        .expect(404);
    });
  });

  describe("PATCH /:id", () => {
    it("редактирует поля, возвращает обновлённый проект", async () => {
      const p = await seed("a0", { title: "Old" });
      const res = await patch(p.id).send({ title: "New", source: "referral" }).expect(200);
      expect(res.body.data.title).toBe("New");
      expect(res.body.data.source).toBe("referral");
    });

    it("изменение value → событие project.updated {changed:[value]}", async () => {
      const p = await seed("a0", { value: 100 });
      await patch(p.id).send({ value: 200 }).expect(200);
      expect(await eventCount(p.id, "project.updated")).toBe(1);
      const ev = await prisma.activityEvent.findFirst({ where: { projectId: p.id, type: "project.updated" } });
      expect((ev?.payload as { changed: string[] }).changed).toEqual(["value"]);
    });

    it("изменение ownerId → событие project.updated {changed:[owner]}", async () => {
      const p = await seed("a0");
      await patch(p.id).send({ ownerId: userId }).expect(200);
      const ev = await prisma.activityEvent.findFirst({ where: { projectId: p.id, type: "project.updated" } });
      expect((ev?.payload as { changed: string[] }).changed).toEqual(["owner"]);
    });

    it("изменение только title → события НЕТ (§6.3: не значимое поле)", async () => {
      const p = await seed("a0", { title: "Old" });
      await patch(p.id).send({ title: "New" }).expect(200);
      expect(await eventCount(p.id, "project.updated")).toBe(0);
    });

    it("value без фактического изменения → события НЕТ", async () => {
      const p = await seed("a0", { value: 100 });
      await patch(p.id).send({ value: 100 }).expect(200);
      expect(await eventCount(p.id, "project.updated")).toBe(0);
    });

    it("пустое тело → 400 (at-least-one)", async () => {
      const p = await seed("a0");
      await patch(p.id).send({}).expect(400);
    });

    it("попытка сменить phaseId/rank/status → отсекается схемой (не влияет)", async () => {
      const p = await seed("a0", { title: "Old" });
      const res = await patch(p.id)
        .send({ title: "New", phaseId: phaseIds[1], status: "WON", rank: "zzz" })
        .expect(200);
      expect(res.body.data.phaseId).toBe(phaseIds[0]); // фаза не тронута
      expect(res.body.data.status).toBe("OPEN");
      expect(res.body.data.rank).toBe("a0");
    });

    it("чужой проект → 404", async () => {
      const p = await seed("a0");
      const stranger = await signUp(app);
      await request(app.getHttpServer())
        .patch(`/v1/projects/${p.id}`)
        .set("Authorization", `Bearer ${stranger.token}`)
        .send({ title: "X" })
        .expect(404);
    });

    it("MEMBER → 403 (нет update Project)", async () => {
      const p = await seed("a0");
      await prisma.membership.updateMany({ data: { role: "MEMBER" } });
      await patch(p.id).send({ title: "X" }).expect(403);
    });
  });

  describe("DELETE /:id", () => {
    it("удаляет проект → 204, каскадит Task и ActivityEvent", async () => {
      const p = await seed("a0");
      await prisma.task.create({ data: { orgId, projectId: p.id, title: "T" } });
      await patch(p.id).send({ value: 5 }).expect(200); // породит activity event

      await del(p.id).expect(200);
      expect(await prisma.project.findUnique({ where: { id: p.id } })).toBeNull();
      expect(await prisma.task.count({ where: { projectId: p.id } })).toBe(0);
      expect(await prisma.activityEvent.count({ where: { projectId: p.id } })).toBe(0);
    });

    it("несуществующий → 404", async () => {
      await del("00000000-0000-0000-0000-000000000000").expect(404);
    });

    it("чужой проект → 404", async () => {
      const p = await seed("a0");
      const stranger = await signUp(app);
      await request(app.getHttpServer())
        .delete(`/v1/projects/${p.id}`)
        .set("Authorization", `Bearer ${stranger.token}`)
        .expect(404);
    });

    it("MANAGER → 403 (delete только O/A, §10)", async () => {
      const p = await seed("a0");
      await prisma.membership.updateMany({ data: { role: "MANAGER" } });
      await del(p.id).expect(403);
    });

    it("MANAGER всё же может PATCH (update разрешён)", async () => {
      const p = await seed("a0");
      await prisma.membership.updateMany({ data: { role: "MANAGER" } });
      await patch(p.id).send({ title: "M" }).expect(200);
    });
  });
});
