import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@helix/db";
import { createTestApp } from "../helpers/create-test-app";

let counter = 0;

async function signUp(app: INestApplication): Promise<{ token: string; orgId: string; userId: string }> {
  const email = `pa${counter++}@example.com`;
  const res = await request(app.getHttpServer())
    .post("/v1/auth/register")
    .send({ email, name: "Pa", password: "correct horse battery staple" })
    .expect(201);
  const token = res.body.data.accessToken as string;
  const claims = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString());
  return { token, orgId: claims.activeOrgId, userId: claims.sub };
}

describe("ProjectAssignee CRUD (§2/§6.3, unit 4)", () => {
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

  // Второй пользователь-член ЭТОЙ орги — валидный co-worker.
  async function addOrgMember(): Promise<string> {
    const other = await prisma.user.create({
      data: { email: `m${counter++}@example.com`, name: "Coworker", passwordHash: "x" },
    });
    await prisma.membership.create({ data: { orgId, userId: other.id, role: "MEMBER" } });
    return other.id;
  }

  beforeEach(async () => {
    const u = await signUp(app);
    token = u.token;
    orgId = u.orgId;
    userId = u.userId;
    const ws = (
      await request(app.getHttpServer())
        .post("/v1/workspaces")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Board" })
        .expect(201)
    ).body.data;
    projectId = (
      await request(app.getHttpServer())
        .post(`/v1/workspaces/${ws.id}/projects`)
        .set("Authorization", `Bearer ${token}`)
        .send({ title: "Lead" })
        .expect(201)
    ).body.data.id;
  });

  const assign = (pid: string, uid: string) =>
    request(app.getHttpServer()).post(`/v1/projects/${pid}/assignees`).set("Authorization", `Bearer ${token}`).send({ userId: uid });
  const list = (pid: string) =>
    request(app.getHttpServer()).get(`/v1/projects/${pid}/assignees`).set("Authorization", `Bearer ${token}`);
  const unassign = (pid: string, uid: string) =>
    request(app.getHttpServer()).delete(`/v1/projects/${pid}/assignees/${uid}`).set("Authorization", `Bearer ${token}`);

  describe("POST / GET / DELETE", () => {
    it("назначает co-worker → 201 + денорм name/email; GET показывает", async () => {
      const co = await addOrgMember();
      const res = await assign(projectId, co).expect(201);
      expect(res.body.data.userId).toBe(co);
      expect(res.body.data.name).toBe("Coworker");
      expect((await list(projectId).expect(200)).body.data).toHaveLength(1);
    });

    it("повтор → 409", async () => {
      const co = await addOrgMember();
      await assign(projectId, co).expect(201);
      await assign(projectId, co).expect(409);
    });

    it("снятие → 200, строка удалена", async () => {
      const co = await addOrgMember();
      await assign(projectId, co).expect(201);
      await unassign(projectId, co).expect(200);
      expect((await list(projectId).expect(200)).body.data).toHaveLength(0);
    });

    it("снятие не-назначенного → 404", async () => {
      const co = await addOrgMember();
      await unassign(projectId, co).expect(404);
    });
  });

  describe("инварианты (§6.3)", () => {
    it("пользователь чужой орги → 400 (tenant, тот же guard, что reassign)", async () => {
      const stranger = await signUp(app);
      await assign(projectId, stranger.userId).expect(400);
    });

    it("чужой проект → 404", async () => {
      const co = await addOrgMember();
      const stranger = await signUp(app);
      await request(app.getHttpServer())
        .post(`/v1/projects/${projectId}/assignees`)
        .set("Authorization", `Bearer ${stranger.token}`)
        .send({ userId: co })
        .expect(404);
    });
  });

  describe("owner ⊥ assignee (§6.3 независимость)", () => {
    it("назначение assignee НЕ меняет ownerId", async () => {
      const co = await addOrgMember();
      await assign(projectId, co).expect(201);
      const row = await prisma.project.findUnique({ where: { id: projectId }, select: { ownerId: true } });
      // owner как был — создатель по дефолту (decisions.md ADR), не пул: assignee его не трогает.
      expect(row?.ownerId).toBe(userId);
    });

    it("reassign owner НЕ трогает список assignee", async () => {
      const co = await addOrgMember();
      await assign(projectId, co).expect(201);
      await request(app.getHttpServer())
        .post(`/v1/projects/${projectId}/reassign`)
        .set("Authorization", `Bearer ${token}`)
        .send({ ownerId: userId })
        .expect(200);
      expect((await list(projectId).expect(200)).body.data).toHaveLength(1); // assignee цел
    });
  });

  describe("RBAC (§2: assignee = Manager+)", () => {
    it("Manager назначает → 201", async () => {
      const co = await addOrgMember();
      await prisma.membership.updateMany({ where: { userId }, data: { role: "MANAGER" } });
      await assign(projectId, co).expect(201);
    });

    it("Member назначает → 403, но читает → 200", async () => {
      const co = await addOrgMember();
      await prisma.membership.updateMany({ where: { userId }, data: { role: "MEMBER" } });
      await assign(projectId, co).expect(403);
      await list(projectId).expect(200);
    });
  });
});
