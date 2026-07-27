import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@helix/db";
import { createTestApp } from "../helpers/create-test-app";

let counter = 0;

async function signUp(app: INestApplication): Promise<{ token: string; orgId: string }> {
  const email = `pc${counter++}@example.com`;
  const res = await request(app.getHttpServer())
    .post("/v1/auth/register")
    .send({ email, name: "Pc", password: "correct horse battery staple" })
    .expect(201);
  const token = res.body.data.accessToken as string;
  const orgId = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString()).activeOrgId;
  return { token, orgId };
}

describe("ProjectContact CRUD (§2/§5, unit 3)", () => {
  let app: INestApplication;
  let token: string;
  let orgId: string;
  let projectId: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function makeProject(audience = "B2B"): Promise<string> {
    const ws = (
      await request(app.getHttpServer())
        .post("/v1/workspaces")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Board", audience })
        .expect(201)
    ).body.data;
    return (
      await request(app.getHttpServer())
        .post(`/v1/workspaces/${ws.id}/projects`)
        .set("Authorization", `Bearer ${token}`)
        .send({ title: "Lead" })
        .expect(201)
    ).body.data.id;
  }

  beforeEach(async () => {
    const u = await signUp(app);
    token = u.token;
    orgId = u.orgId;
    projectId = await makeProject();
  });

  const seedContact = (data: Record<string, unknown> = {}) =>
    prisma.contact.create({ data: { orgId, name: "John", ...data } });
  const link = (pid: string, body: Record<string, unknown>) =>
    request(app.getHttpServer()).post(`/v1/projects/${pid}/contacts`).set("Authorization", `Bearer ${token}`).send(body);
  const list = (pid: string) =>
    request(app.getHttpServer()).get(`/v1/projects/${pid}/contacts`).set("Authorization", `Bearer ${token}`);
  const patchRoles = (pid: string, cid: string, roles: string[]) =>
    request(app.getHttpServer()).patch(`/v1/projects/${pid}/contacts/${cid}`).set("Authorization", `Bearer ${token}`).send({ roles });
  const unlink = (pid: string, cid: string) =>
    request(app.getHttpServer()).delete(`/v1/projects/${pid}/contacts/${cid}`).set("Authorization", `Bearer ${token}`);

  describe("POST — привязка (§5)", () => {
    it("привязывает контакт с ролями → 201, денорм name/companyName", async () => {
      const co = await prisma.company.create({ data: { orgId, name: "Acme" } });
      const c = await seedContact({ name: "Alice", email: "a@x.com", companyId: co.id });
      const res = await link(projectId, { contactId: c.id, roles: ["CHAMPION", "BLOCKER"] }).expect(201);
      expect(res.body.data.contactId).toBe(c.id);
      expect(res.body.data.name).toBe("Alice");
      expect(res.body.data.companyName).toBe("Acme");
      expect(new Set(res.body.data.roles)).toEqual(new Set(["CHAMPION", "BLOCKER"]));
    });

    it("пустой массив ролей → 201 (роль неизвестна, §5.2)", async () => {
      const c = await seedContact();
      const res = await link(projectId, { contactId: c.id, roles: [] }).expect(201);
      expect(res.body.data.roles).toEqual([]);
    });

    it("дубли ролей в наборе схлопываются (множество)", async () => {
      const c = await seedContact();
      const res = await link(projectId, { contactId: c.id, roles: ["CHAMPION", "CHAMPION"] }).expect(201);
      expect(res.body.data.roles).toEqual(["CHAMPION"]);
    });

    it("роль вне enum → 400 (Zod)", async () => {
      const c = await seedContact();
      await link(projectId, { contactId: c.id, roles: ["champion"] }).expect(400);
    });

    it("смёрженный контакт → 409 + mergedIntoId (§5.1)", async () => {
      const target = await seedContact({ name: "T" });
      const merged = await seedContact({ name: "M", mergedIntoId: target.id });
      const res = await link(projectId, { contactId: merged.id, roles: [] }).expect(409);
      expect(res.body.error.code).toBe("CONTACT_MERGED_LINK");
      expect(res.body.error.details.mergedIntoId).toBe(target.id);
    });

    it("повторная привязка → 409 (§5.2), роли — только через PATCH", async () => {
      const c = await seedContact();
      await link(projectId, { contactId: c.id, roles: ["CHAMPION"] }).expect(201);
      const res = await link(projectId, { contactId: c.id, roles: ["BLOCKER"] }).expect(409);
      expect(res.body.error.code).toBe("CONTACT_ALREADY_LINKED");
    });

    it("контакт чужой орги → 404", async () => {
      const stranger = await signUp(app);
      const foreign = await prisma.contact.create({ data: { orgId: stranger.orgId, name: "F" } });
      await link(projectId, { contactId: foreign.id, roles: [] }).expect(404);
    });

    it("чужой проект → 404", async () => {
      const c = await seedContact();
      const stranger = await signUp(app);
      await request(app.getHttpServer())
        .post(`/v1/projects/${projectId}/contacts`)
        .set("Authorization", `Bearer ${stranger.token}`)
        .send({ contactId: c.id, roles: [] })
        .expect(404);
    });
  });

  describe("PATCH — роли (§5.2)", () => {
    it("заменяет набор ролей → 200", async () => {
      const c = await seedContact();
      await link(projectId, { contactId: c.id, roles: ["CHAMPION"] }).expect(201);
      const res = await patchRoles(projectId, c.id, ["BLOCKER", "INFLUENCER"]).expect(200);
      expect(new Set(res.body.data.roles)).toEqual(new Set(["BLOCKER", "INFLUENCER"]));
    });

    it("roles=[] → 200 (сброс в «неизвестно», не ошибка)", async () => {
      const c = await seedContact();
      await link(projectId, { contactId: c.id, roles: ["CHAMPION"] }).expect(201);
      const res = await patchRoles(projectId, c.id, []).expect(200);
      expect(res.body.data.roles).toEqual([]);
    });

    it("непривязанный контакт → 404", async () => {
      const c = await seedContact();
      await patchRoles(projectId, c.id, ["CHAMPION"]).expect(404);
    });
  });

  describe("DELETE — отвязка (§9)", () => {
    it("отвязка удаляет строку, контакт жив", async () => {
      const c = await seedContact();
      await link(projectId, { contactId: c.id, roles: ["CHAMPION"] }).expect(201);
      await unlink(projectId, c.id).expect(200);
      expect((await list(projectId).expect(200)).body.data).toHaveLength(0);
      expect(await prisma.contact.findUnique({ where: { id: c.id } })).not.toBeNull();
    });

    it("удаление проекта → его ProjectContact каскадно, контакт жив", async () => {
      const c = await seedContact();
      await link(projectId, { contactId: c.id, roles: [] }).expect(201);
      await request(app.getHttpServer())
        .delete(`/v1/projects/${projectId}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(await prisma.projectContact.count({ where: { contactId: c.id } })).toBe(0);
      expect(await prisma.contact.findUnique({ where: { id: c.id } })).not.toBeNull();
    });
  });

  describe("audience — recommendation, не gate (§4)", () => {
    it("B2C: привязка без Company → 201", async () => {
      const b2c = await makeProject("B2C");
      const c = await seedContact();
      await link(b2c, { contactId: c.id, roles: [] }).expect(201);
    });

    it("«неуместная» для B2C роль (ECONOMIC_BUYER) → 201, НЕ 400 (soft)", async () => {
      const b2c = await makeProject("B2C");
      const c = await seedContact();
      await link(b2c, { contactId: c.id, roles: ["ECONOMIC_BUYER"] }).expect(201);
    });
  });

  describe("RBAC (capability)", () => {
    it("Member привязывает → 201", async () => {
      const c = await seedContact();
      await prisma.membership.updateMany({ data: { role: "MEMBER" } });
      await link(projectId, { contactId: c.id, roles: ["CHAMPION"] }).expect(201);
    });

    it("Viewer привязывает → 403, читает → 200", async () => {
      const c = await seedContact();
      await prisma.membership.updateMany({ data: { role: "VIEWER" } });
      await link(projectId, { contactId: c.id, roles: [] }).expect(403);
      await list(projectId).expect(200);
    });
  });
});
