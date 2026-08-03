import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@helix/db";
import { createTestApp } from "../helpers/create-test-app";

let counter = 0;

async function signUp(app: INestApplication): Promise<{ token: string; orgId: string }> {
  const email = `co${counter++}@example.com`;
  const res = await request(app.getHttpServer())
    .post("/v1/auth/register")
    .send({ email, name: "Co", password: "correct horse battery staple" })
    .expect(201);
  const token = res.body.data.accessToken as string;
  const orgId = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString()).activeOrgId;
  return { token, orgId };
}

describe("Company CRUD (§2, unit 4)", () => {
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
    request(app.getHttpServer()).post("/v1/companies").set("Authorization", `Bearer ${token}`).send(body);
  const list = (qs = "") =>
    request(app.getHttpServer()).get(`/v1/companies${qs}`).set("Authorization", `Bearer ${token}`);
  const get = (id: string) =>
    request(app.getHttpServer()).get(`/v1/companies/${id}`).set("Authorization", `Bearer ${token}`);
  const patch = (id: string) =>
    request(app.getHttpServer()).patch(`/v1/companies/${id}`).set("Authorization", `Bearer ${token}`);
  const del = (id: string) =>
    request(app.getHttpServer()).delete(`/v1/companies/${id}`).set("Authorization", `Bearer ${token}`);

  describe("POST", () => {
    it("создаёт компанию + пустой dedupHint, domainNormalized не в ответе", async () => {
      const res = await create({ name: "Acme", domain: "https://WWW.Acme.com/about", industry: "Tech" }).expect(201);
      const company = res.body.data.company;
      expect(company.name).toBe("Acme");
      expect(company.domain).toBe("https://WWW.Acme.com/about"); // хранится как ввёл
      expect("domainNormalized" in company).toBe(false); // internal
      expect(res.body.data.dedupHint).toEqual({ candidates: [] });
      // канон вычислен: strip protocol/www/path, lower
      const row = await prisma.company.findUnique({ where: { id: company.id } });
      expect(row?.domainNormalized).toBe("acme.com");
    });

    it("name обязателен → 400", async () => {
      await create({ domain: "x.com" }).expect(400);
    });

    it("dedupHint: тот же домен (после канонизации) → кандидат, без него — пусто", async () => {
      const first = (await create({ name: "Acme", domain: "acme.com" }).expect(201)).body.data.company;
      const res = await create({ name: "Acme Inc", domain: "https://www.ACME.com/" }).expect(201);
      expect(res.body.data.dedupHint.candidates).toEqual([{ id: first.id, name: "Acme", domain: "acme.com" }]);

      const noHit = await create({ name: "Other", domain: "other.com" }).expect(201);
      expect(noHit.body.data.dedupHint.candidates).toEqual([]);

      const noDomain = await create({ name: "No Domain" }).expect(201);
      expect(noDomain.body.data.dedupHint.candidates).toEqual([]);
    });
  });

  describe("GET list", () => {
    it("keyset-пагинация: hasMore + срез по limit", async () => {
      for (let i = 0; i < 3; i++) await create({ name: `C${i}` }).expect(201);
      const page = await list("?limit=2").expect(200);
      expect(page.body.data.companies).toHaveLength(2);
      expect(page.body.data.hasMore).toBe(true);
    });

    it("q фильтрует по name (case-insensitive)", async () => {
      await create({ name: "Alpha" }).expect(201);
      await create({ name: "Beta" }).expect(201);
      const res = await list("?q=alph").expect(200);
      expect(res.body.data.companies).toHaveLength(1);
      expect(res.body.data.companies[0].name).toBe("Alpha");
    });
  });

  describe("GET :id — карточка + контакты", () => {
    it("возвращает активные контакты компании, смёрженные скрыты", async () => {
      const co = (await create({ name: "Acme" }).expect(201)).body.data.company;
      const active = await prisma.contact.create({ data: { orgId, name: "Active", companyId: co.id } });
      // тумбстон: смёрженный контакт той же компании — в детали не показываем
      const target = await prisma.contact.create({ data: { orgId, name: "Target" } });
      await prisma.contact.create({
        data: { orgId, name: "Merged", companyId: co.id, mergedIntoId: target.id },
      });

      const res = await get(co.id).expect(200);
      const ids = res.body.data.contacts.map((c: { id: string }) => c.id);
      expect(ids).toEqual([active.id]);
    });

    it("чужая компания → 404", async () => {
      const co = (await create({ name: "Acme" }).expect(201)).body.data.company;
      const stranger = await signUp(app);
      await request(app.getHttpServer())
        .get(`/v1/companies/${co.id}`)
        .set("Authorization", `Bearer ${stranger.token}`)
        .expect(404);
    });
  });

  describe("PATCH", () => {
    it("правит поля; domain:null очищает и обнуляет канон", async () => {
      const co = (await create({ name: "Acme", domain: "acme.com" }).expect(201)).body.data.company;
      const res = await patch(co.id).send({ domain: null }).expect(200);
      expect(res.body.data.domain).toBeNull();
      const row = await prisma.company.findUnique({ where: { id: co.id } });
      expect(row?.domainNormalized).toBeNull();
    });

    it("пустое тело → 400", async () => {
      const co = (await create({ name: "Acme" }).expect(201)).body.data.company;
      await patch(co.id).send({}).expect(400);
    });
  });

  describe("DELETE", () => {
    it("удаляет компанию, контакты выживают с companyId=NULL (§6)", async () => {
      const co = (await create({ name: "Acme" }).expect(201)).body.data.company;
      const contact = await prisma.contact.create({ data: { orgId, name: "John", companyId: co.id } });

      await del(co.id).expect(200);
      expect(await prisma.company.findUnique({ where: { id: co.id } })).toBeNull();
      const after = await prisma.contact.findUnique({ where: { id: contact.id } });
      expect(after).not.toBeNull();
      expect(after?.companyId).toBeNull();
      expect(after?.orgId).toBe(orgId);
    });

    it("чужая компания → 404", async () => {
      const co = (await create({ name: "Acme" }).expect(201)).body.data.company;
      const stranger = await signUp(app);
      await request(app.getHttpServer())
        .delete(`/v1/companies/${co.id}`)
        .set("Authorization", `Bearer ${stranger.token}`)
        .expect(404);
    });
  });

  // Матрица (ADR blast-radius): create=Member+, read=Member+/Viewer, update/delete=Manager+.
  describe("authz", () => {
    it("MEMBER: create → 201, read → 200, update/delete → 403", async () => {
      const co = (await create({ name: "Acme" }).expect(201)).body.data.company;
      await prisma.membership.updateMany({ data: { role: "MEMBER" } });
      await create({ name: "New" }).expect(201); // create — Member+
      await list().expect(200);
      await patch(co.id).send({ name: "X" }).expect(403); // update — Manager+
      await del(co.id).expect(403); // delete — Manager+
    });

    it("MANAGER: create/update/delete → все разрешены", async () => {
      const co = (await create({ name: "Acme" }).expect(201)).body.data.company;
      await prisma.membership.updateMany({ data: { role: "MANAGER" } });
      await patch(co.id).send({ name: "Renamed" }).expect(200);
      await del(co.id).expect(200); // delete — Manager+ (было O/A)
    });

    it("VIEWER: read → 200, create → 403", async () => {
      await prisma.membership.updateMany({ data: { role: "VIEWER" } });
      await list().expect(200);
      await create({ name: "X" }).expect(403);
    });
  });
});
