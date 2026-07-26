import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@helix/db";
import { createTestApp } from "../helpers/create-test-app";

let counter = 0;

async function signUp(app: INestApplication): Promise<{ token: string; orgId: string; userId: string }> {
  const email = `tk${counter++}@example.com`;
  const res = await request(app.getHttpServer())
    .post("/v1/auth/register")
    .send({ email, name: "Tk", password: "correct horse battery staple" })
    .expect(201);
  const token = res.body.data.accessToken as string;
  const claims = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString());
  return { token, orgId: claims.activeOrgId, userId: claims.sub };
}

describe("Task CRUD (§2/§3/§8, unit 2)", () => {
  let app: INestApplication;
  let token: string;
  let orgId: string;
  let userId: string;
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
    orgId = u.orgId;
    userId = u.userId;
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

  const create = (pid: string, body: Record<string, unknown>) =>
    request(app.getHttpServer()).post(`/v1/projects/${pid}/tasks`).set("Authorization", `Bearer ${token}`).send(body);
  const list = (pid: string) =>
    request(app.getHttpServer()).get(`/v1/projects/${pid}/tasks`).set("Authorization", `Bearer ${token}`);
  const patch = (tid: string, body: Record<string, unknown>) =>
    request(app.getHttpServer()).patch(`/v1/tasks/${tid}`).set("Authorization", `Bearer ${token}`).send(body);
  const del = (tid: string) =>
    request(app.getHttpServer()).delete(`/v1/tasks/${tid}`).set("Authorization", `Bearer ${token}`);

  describe("POST / GET", () => {
    it("создаёт таск → 201; assigneeId=null легально", async () => {
      const res = await create(projectId, { title: "Call client" }).expect(201);
      expect(res.body.data.title).toBe("Call client");
      expect(res.body.data.done).toBe(false);
      expect(res.body.data.assigneeId).toBeNull();
      expect(res.body.data.overdue).toBe(false);
    });

    it("assigneeId члена орги → 201", async () => {
      const res = await create(projectId, { title: "T", assigneeId: userId }).expect(201);
      expect(res.body.data.assigneeId).toBe(userId);
    });

    it("assigneeId чужой орги → 400 (assertOrgMember §3)", async () => {
      const stranger = await signUp(app);
      await create(projectId, { title: "T", assigneeId: stranger.userId }).expect(400);
    });

    it("title обязателен → 400", async () => {
      await create(projectId, {}).expect(400);
    });

    it("GET возвращает таски сделки", async () => {
      const a = (await create(projectId, { title: "one" }).expect(201)).body.data;
      const b = (await create(projectId, { title: "two" }).expect(201)).body.data;
      const res = await list(projectId).expect(200);
      const ids = res.body.data.map((t: { id: string }) => t.id);
      expect(ids).toContain(a.id);
      expect(ids).toContain(b.id);
    });

    it("таск в чужом проекте → 404", async () => {
      const stranger = await signUp(app);
      await request(app.getHttpServer())
        .post(`/v1/projects/${projectId}/tasks`)
        .set("Authorization", `Bearer ${stranger.token}`)
        .send({ title: "T" })
        .expect(404);
    });
  });

  describe("PATCH (§2)", () => {
    it("правит title/dueAt; dueAt:null очищает", async () => {
      const t = (await create(projectId, { title: "Old", dueAt: "2026-09-20T12:00:00.000Z" }).expect(201)).body.data;
      const res = await patch(t.id, { title: "New", dueAt: null }).expect(200);
      expect(res.body.data.title).toBe("New");
      expect(res.body.data.dueAt).toBeNull();
    });

    it("done в теле → 400 (strict, §2)", async () => {
      const t = (await create(projectId, { title: "T" }).expect(201)).body.data;
      await patch(t.id, { done: true }).expect(400);
    });

    it("assigneeId чужой орги → 400", async () => {
      const t = (await create(projectId, { title: "T" }).expect(201)).body.data;
      const stranger = await signUp(app);
      await patch(t.id, { assigneeId: stranger.userId }).expect(400);
    });

    it("чужой таск → 404", async () => {
      const t = (await create(projectId, { title: "T" }).expect(201)).body.data;
      const stranger = await signUp(app);
      await request(app.getHttpServer())
        .patch(`/v1/tasks/${t.id}`)
        .set("Authorization", `Bearer ${stranger.token}`)
        .send({ title: "X" })
        .expect(404);
    });
  });

  describe("DELETE / целостность", () => {
    it("удаляет таск → 200", async () => {
      const t = (await create(projectId, { title: "T" }).expect(201)).body.data;
      await del(t.id).expect(200);
      expect(await prisma.task.findUnique({ where: { id: t.id } })).toBeNull();
    });

    it("удаление проекта → таски каскадно удалены", async () => {
      const t = (await create(projectId, { title: "T" }).expect(201)).body.data;
      await request(app.getHttpServer()).delete(`/v1/projects/${projectId}`).set("Authorization", `Bearer ${token}`).expect(200);
      expect(await prisma.task.count({ where: { id: t.id } })).toBe(0);
    });

    it("увольнение исполнителя (delete User) → таск жив, assigneeId=NULL (SetNull)", async () => {
      const co = await prisma.user.create({ data: { email: `co${counter++}@x.com`, name: "Co", passwordHash: "x" } });
      await prisma.membership.create({ data: { orgId, userId: co.id, role: "MEMBER" } });
      const t = (await create(projectId, { title: "T", assigneeId: co.id }).expect(201)).body.data;
      await prisma.user.delete({ where: { id: co.id } });
      const after = await prisma.task.findUnique({ where: { id: t.id } });
      expect(after).not.toBeNull();
      expect(after?.assigneeId).toBeNull();
    });
  });

  describe("RBAC (capability)", () => {
    it("Member создаёт → 201", async () => {
      await prisma.membership.updateMany({ where: { userId }, data: { role: "MEMBER" } });
      await create(projectId, { title: "T" }).expect(201);
    });

    it("Viewer создаёт → 403, читает → 200", async () => {
      await prisma.membership.updateMany({ where: { userId }, data: { role: "VIEWER" } });
      await create(projectId, { title: "T" }).expect(403);
      await list(projectId).expect(200);
    });
  });
});
