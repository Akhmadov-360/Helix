import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@helix/db";
import { createTestApp } from "../helpers/create-test-app";

let counter = 0;

async function signUp(app: INestApplication): Promise<{ token: string; orgId: string; userId: string }> {
  const email = `cr${counter++}@example.com`;
  const res = await request(app.getHttpServer())
    .post("/v1/auth/register")
    .send({ email, name: "Cr", password: "correct horse battery staple" })
    .expect(201);
  const token = res.body.data.accessToken as string;
  const claims = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString());
  return { token, orgId: claims.activeOrgId, userId: claims.sub };
}

describe("Task complete/reopen + события (§5, unit 3)", () => {
  let app: INestApplication;
  let token: string;
  let projectId: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    const u = await signUp(app);
    token = u.token;
    const ws = (
      await request(app.getHttpServer()).post("/v1/workspaces").set("Authorization", `Bearer ${token}`).send({ name: "B" }).expect(201)
    ).body.data;
    projectId = (
      await request(app.getHttpServer())
        .post(`/v1/workspaces/${ws.id}/projects`)
        .set("Authorization", `Bearer ${token}`)
        .send({ title: "Lead" })
        .expect(201)
    ).body.data.id;
  });

  const create = (body: Record<string, unknown>) =>
    request(app.getHttpServer()).post(`/v1/projects/${projectId}/tasks`).set("Authorization", `Bearer ${token}`).send(body);
  const complete = (tid: string) =>
    request(app.getHttpServer()).post(`/v1/tasks/${tid}/complete`).set("Authorization", `Bearer ${token}`);
  const reopen = (tid: string) =>
    request(app.getHttpServer()).post(`/v1/tasks/${tid}/reopen`).set("Authorization", `Bearer ${token}`);
  const patch = (tid: string, body: Record<string, unknown>) =>
    request(app.getHttpServer()).patch(`/v1/tasks/${tid}`).set("Authorization", `Bearer ${token}`).send(body);
  const del = (tid: string) =>
    request(app.getHttpServer()).delete(`/v1/tasks/${tid}`).set("Authorization", `Bearer ${token}`);
  const eventCount = (type: string) =>
    prisma.activityEvent.count({ where: { projectId, type } });

  describe("события (P4)", () => {
    it("create → task.created в ленте, payload со снапшотом", async () => {
      const res = await create({ title: "Call client" }).expect(201);
      expect(await eventCount("task.created")).toBe(1);
      const ev = await prisma.activityEvent.findFirst({ where: { projectId, type: "task.created" } });
      const p = ev?.payload as Record<string, unknown>;
      expect(p.taskId).toBe(res.body.data.id);
      expect(p.taskTitle).toBe("Call client");
      expect(p.actorName).toBe("Cr");
    });

    it("complete → task.completed в ленте (done=true), payload содержит taskId+title", async () => {
      const t = (await create({ title: "Task" }).expect(201)).body.data;
      const res = await complete(t.id).expect(200);
      expect(res.body.data.done).toBe(true);
      expect(await eventCount("task.completed")).toBe(1);
      const ev = await prisma.activityEvent.findFirst({ where: { projectId, type: "task.completed" } });
      expect((ev?.payload as { taskId: string }).taskId).toBe(t.id);
    });

    it("payload assigneeName = null для таска без исполнителя", async () => {
      const t = (await create({ title: "T" }).expect(201)).body.data;
      await complete(t.id).expect(200);
      const ev = await prisma.activityEvent.findFirst({ where: { projectId, type: "task.completed" } });
      expect((ev?.payload as { assigneeName: string | null }).assigneeName).toBeNull();
    });
  });

  describe("идемпотентность (§5)", () => {
    it("двойной complete → одно событие, оба 200", async () => {
      const t = (await create({ title: "T" }).expect(201)).body.data;
      await complete(t.id).expect(200);
      await complete(t.id).expect(200); // уже done → no-op
      expect(await eventCount("task.completed")).toBe(1);
    });

    it("reopen на open → no-op, 200, события нет", async () => {
      const t = (await create({ title: "T" }).expect(201)).body.data;
      const res = await reopen(t.id).expect(200);
      expect(res.body.data.done).toBe(false);
      expect(await eventCount("task.reopened")).toBe(0);
    });

    it("complete → reopen → done=false", async () => {
      const t = (await create({ title: "T" }).expect(201)).body.data;
      await complete(t.id).expect(200);
      const res = await reopen(t.id).expect(200);
      expect(res.body.data.done).toBe(false);
    });
  });

  describe("что НЕ пишет событие (§5)", () => {
    it("reopen НЕ пишет событие", async () => {
      const t = (await create({ title: "T" }).expect(201)).body.data;
      await complete(t.id).expect(200);
      await reopen(t.id).expect(200);
      const types = (await prisma.activityEvent.findMany({ where: { projectId } })).map((e) => e.type);
      expect(types).not.toContain("task.reopened");
    });

    it("PATCH title/dueAt НЕ пишет событие", async () => {
      const t = (await create({ title: "T" }).expect(201)).body.data;
      const before = await prisma.activityEvent.count({ where: { projectId } });
      await patch(t.id, { title: "New" }).expect(200);
      expect(await prisma.activityEvent.count({ where: { projectId } })).toBe(before);
    });

    it("delete НЕ пишет событие", async () => {
      const t = (await create({ title: "T" }).expect(201)).body.data;
      const before = await prisma.activityEvent.count({ where: { projectId } });
      await del(t.id).expect(200);
      expect(await prisma.activityEvent.count({ where: { projectId } })).toBe(before);
    });
  });

  describe("RBAC + tenant", () => {
    it("Viewer complete → 403", async () => {
      const t = (await create({ title: "T" }).expect(201)).body.data;
      await prisma.membership.updateMany({ data: { role: "VIEWER" } });
      await complete(t.id).expect(403);
    });

    it("complete чужого таска → 404", async () => {
      const t = (await create({ title: "T" }).expect(201)).body.data;
      const stranger = await signUp(app);
      await request(app.getHttpServer())
        .post(`/v1/tasks/${t.id}/complete`)
        .set("Authorization", `Bearer ${stranger.token}`)
        .expect(404);
    });
  });
});
