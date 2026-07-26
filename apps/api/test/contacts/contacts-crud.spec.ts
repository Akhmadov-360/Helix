import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@helix/db";
import { createTestApp } from "../helpers/create-test-app";

let counter = 0;

async function signUp(app: INestApplication): Promise<{ token: string; orgId: string }> {
  const email = `ct${counter++}@example.com`;
  const res = await request(app.getHttpServer())
    .post("/v1/auth/register")
    .send({ email, name: "Ct", password: "correct horse battery staple" })
    .expect(201);
  const token = res.body.data.accessToken as string;
  const orgId = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString()).activeOrgId;
  return { token, orgId };
}

describe("Contact CRUD + emailNormalized (§2/§4.3, unit 5)", () => {
  let app: INestApplication;
  let token: string;
  let orgId: string;

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
  });

  const create = (body: Record<string, unknown>) =>
    request(app.getHttpServer()).post("/v1/contacts").set("Authorization", `Bearer ${token}`).send(body);
  const list = (qs = "") =>
    request(app.getHttpServer()).get(`/v1/contacts${qs}`).set("Authorization", `Bearer ${token}`);
  const patch = (id: string) =>
    request(app.getHttpServer()).patch(`/v1/contacts/${id}`).set("Authorization", `Bearer ${token}`);
  const del = (id: string) =>
    request(app.getHttpServer()).delete(`/v1/contacts/${id}`).set("Authorization", `Bearer ${token}`);
  const norm = (id: string) =>
    prisma.contact.findUnique({ where: { id }, select: { emailNormalized: true } });

  describe("POST", () => {
    it("создаёт контакт, ответ обёрнут в {contact, dedupHint}", async () => {
      const res = await create({ name: "John", email: "John@X.com" }).expect(201);
      expect(res.body.data.contact.name).toBe("John");
      expect(res.body.data.contact.email).toBe("John@X.com"); // регистр сохранён
      expect(res.body.data.dedupHint).toEqual({ candidates: [] }); // lookup — единица 6
    });

    it("emailNormalized = lower(trim(email)) (§4.2)", async () => {
      const res = await create({ name: "J", email: "  John@X.com " }).expect(201);
      expect(await norm(res.body.data.contact.id)).toEqual({ emailNormalized: "john@x.com" });
    });

    it("email не в ответе как emailNormalized (§4.4)", async () => {
      const res = await create({ name: "J", email: "a@b.com" }).expect(201);
      expect("emailNormalized" in res.body.data.contact).toBe(false);
      expect("mergedIntoId" in res.body.data.contact).toBe(false);
    });

    it("email NULL → emailNormalized NULL (в дедупе не участвует)", async () => {
      const res = await create({ name: "NoEmail" }).expect(201);
      expect(await norm(res.body.data.contact.id)).toEqual({ emailNormalized: null });
    });

    it("два контакта с одним email создаются оба (хинт не блокирует, §4.1)", async () => {
      await create({ name: "A", email: "same@x.com" }).expect(201);
      await create({ name: "B", email: "same@x.com" }).expect(201);
    });

    it("name обязателен → 400", async () => {
      await create({ email: "a@b.com" }).expect(400);
    });
  });

  describe("PATCH — пересчёт emailNormalized (§4.3)", () => {
    it("смена email пересчитывает канон в той же записи", async () => {
      const id = (await create({ name: "J", email: "old@x.com" }).expect(201)).body.data.contact.id;
      await patch(id).send({ email: "NEW@Y.com" }).expect(200);
      expect(await norm(id)).toEqual({ emailNormalized: "new@y.com" });
    });

    it("email:null очищает email и канон", async () => {
      const id = (await create({ name: "J", email: "x@y.com" }).expect(201)).body.data.contact.id;
      const res = await patch(id).send({ email: null }).expect(200);
      expect(res.body.data.email).toBeNull();
      expect(await norm(id)).toEqual({ emailNormalized: null });
    });

    it("патч без email не трогает канон", async () => {
      const id = (await create({ name: "J", email: "keep@x.com" }).expect(201)).body.data.contact.id;
      await patch(id).send({ name: "Renamed" }).expect(200);
      expect(await norm(id)).toEqual({ emailNormalized: "keep@x.com" });
    });

    it("пустое тело → 400", async () => {
      const id = (await create({ name: "J" }).expect(201)).body.data.contact.id;
      await patch(id).send({}).expect(400);
    });
  });

  describe("GET list", () => {
    it("keyset: hasMore + срез по limit", async () => {
      for (let i = 0; i < 3; i++) await create({ name: `C${i}` }).expect(201);
      const page = await list("?limit=2").expect(200);
      expect(page.body.data.contacts).toHaveLength(2);
      expect(page.body.data.hasMore).toBe(true);
    });

    it("q ищет по name и email; companyId фильтрует", async () => {
      const co = await prisma.company.create({ data: { orgId, name: "Acme" } });
      await create({ name: "Alice", email: "alice@corp.com", companyId: co.id }).expect(201);
      await create({ name: "Bob", email: "bob@other.com" }).expect(201);

      expect((await list("?q=alice").expect(200)).body.data.contacts).toHaveLength(1);
      expect((await list("?q=other.com").expect(200)).body.data.contacts).toHaveLength(1); // по email
      const byCompany = await list(`?companyId=${co.id}`).expect(200);
      expect(byCompany.body.data.contacts).toHaveLength(1);
      expect(byCompany.body.data.contacts[0].name).toBe("Alice");
    });

    it("смёрженные контакты в списке скрыты", async () => {
      const target = await prisma.contact.create({ data: { orgId, name: "Target" } });
      await prisma.contact.create({ data: { orgId, name: "Merged", mergedIntoId: target.id } });
      const res = await list().expect(200);
      const names = res.body.data.contacts.map((c: { name: string }) => c.name);
      expect(names).toContain("Target");
      expect(names).not.toContain("Merged");
    });
  });

  describe("GET :id / tenant", () => {
    it("чужой контакт → 404", async () => {
      const id = (await create({ name: "J" }).expect(201)).body.data.contact.id;
      const stranger = await signUp(app);
      await request(app.getHttpServer())
        .get(`/v1/contacts/${id}`)
        .set("Authorization", `Bearer ${stranger.token}`)
        .expect(404);
    });
  });

  describe("DELETE", () => {
    it("свободный контакт удаляется", async () => {
      const id = (await create({ name: "Solo" }).expect(201)).body.data.contact.id;
      await del(id).expect(200);
      expect(await prisma.contact.findUnique({ where: { id } })).toBeNull();
    });

    it("контакт-участник сделки → 409 (Restrict, §6)", async () => {
      const id = (await create({ name: "InDeal" }).expect(201)).body.data.contact.id;
      const ws = await prisma.workspace.create({ data: { orgId, name: "B" } });
      const phase = await prisma.phase.create({
        data: { workspaceId: ws.id, key: "o", name: { en: "O" }, type: "OPEN", order: 1 },
      });
      const project = await prisma.project.create({
        data: { orgId, workspaceId: ws.id, phaseId: phase.id, title: "L", rank: "a0" },
      });
      await prisma.projectContact.create({ data: { projectId: project.id, contactId: id, orgId } });

      await del(id).expect(409);
      expect(await prisma.contact.findUnique({ where: { id } })).not.toBeNull();
    });
  });

  // Матрица (ADR blast-radius): create=Member+, read=Member+/Viewer, update/delete=Manager+.
  describe("authz + tenant", () => {
    it("Member: create → 201, но update/delete → 403 (shared-объект)", async () => {
      const id = (await create({ name: "J" }).expect(201)).body.data.contact.id;
      await prisma.membership.updateMany({ data: { role: "MEMBER" } });
      await create({ name: "K" }).expect(201); // create — Member+
      await patch(id).send({ name: "K2" }).expect(403); // update — Manager+
      await del(id).expect(403); // delete — Manager+
    });

    it("Manager: update → 200, delete → 200 (было O/A)", async () => {
      const id = (await create({ name: "J" }).expect(201)).body.data.contact.id;
      await prisma.membership.updateMany({ data: { role: "MANAGER" } });
      await patch(id).send({ name: "M" }).expect(200);
      await del(id).expect(200);
    });

    it("Viewer: create → 403, read → 200", async () => {
      await create({ name: "J" }).expect(201);
      await prisma.membership.updateMany({ data: { role: "VIEWER" } });
      await create({ name: "K" }).expect(403);
      await list().expect(200);
    });

    it("orgId из тела игнорируется — контакт в орге вызывающего", async () => {
      const other = await prisma.organization.create({ data: { name: "Other" } });
      const res = await create({ name: "J", orgId: other.id }).expect(201);
      const row = await prisma.contact.findUnique({ where: { id: res.body.data.contact.id } });
      expect(row?.orgId).toBe(orgId); // ALS, не тело
    });
  });
});
