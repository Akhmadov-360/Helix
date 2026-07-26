import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@helix/db";
import { createTestApp } from "../helpers/create-test-app";

let counter = 0;

async function signUp(app: INestApplication): Promise<{ token: string; orgId: string }> {
  const email = `dd${counter++}@example.com`;
  const res = await request(app.getHttpServer())
    .post("/v1/auth/register")
    .send({ email, name: "Dd", password: "correct horse battery staple" })
    .expect(201);
  const token = res.body.data.accessToken as string;
  const orgId = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString()).activeOrgId;
  return { token, orgId };
}

describe("soft dedup — хинт по email (§4, unit 6)", () => {
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
  const dedupCheck = (email: string) =>
    request(app.getHttpServer())
      .get(`/v1/contacts/dedup-check?email=${encodeURIComponent(email)}`)
      .set("Authorization", `Bearer ${token}`);

  describe("хинт в ответе POST (§4.2)", () => {
    it("John@X.com и john@x.com   → один канон → хинт находит существующего", async () => {
      const first = (await create({ name: "John", email: "John@X.com" }).expect(201)).body.data;
      expect(first.dedupHint.candidates).toHaveLength(0); // первый — дублей нет

      const second = await create({ name: "Johnny", email: "john@x.com  " }).expect(201);
      expect(second.body.data.dedupHint.candidates).toHaveLength(1);
      expect(second.body.data.dedupHint.candidates[0].id).toBe(first.contact.id);
    });

    it("новый контакт не попадает в собственный хинт", async () => {
      const res = await create({ name: "Solo", email: "solo@x.com" }).expect(201);
      expect(res.body.data.dedupHint.candidates).toHaveLength(0);
    });

    it("хинт не блокирует создание дубля (§4.1) — оба контакта существуют", async () => {
      await create({ name: "A", email: "same@x.com" }).expect(201);
      const b = await create({ name: "B", email: "same@x.com" }).expect(201);
      expect(b.body.data.dedupHint.candidates).toHaveLength(1); // предупредили, но создали
      const all = await prisma.contact.count({ where: { orgId, emailNormalized: "same@x.com" } });
      expect(all).toBe(2);
    });

    it("companyName денормализован в кандидате", async () => {
      const co = await prisma.company.create({ data: { orgId, name: "Acme" } });
      await create({ name: "Emp", email: "emp@acme.com", companyId: co.id }).expect(201);
      const dup = await create({ name: "Dup", email: "emp@acme.com" }).expect(201);
      expect(dup.body.data.dedupHint.candidates[0].companyName).toBe("Acme");
    });

    it("email NULL → канон NULL → хинт пуст (§4.2)", async () => {
      const res = await create({ name: "NoEmail" }).expect(201);
      expect(res.body.data.dedupHint.candidates).toHaveLength(0);
    });
  });

  describe("gmail-логика отвергнута (§4.2, страж ложных слияний)", () => {
    it("точки в локальной части — РАЗНЫЕ контакты (не сливаем)", async () => {
      await create({ name: "A", email: "j.doe@corp.com" }).expect(201);
      const other = await create({ name: "B", email: "jdoe@corp.com" }).expect(201);
      expect(other.body.data.dedupHint.candidates).toHaveLength(0); // разные каноны
    });

    it("+tag — РАЗНЫЕ контакты", async () => {
      await create({ name: "A", email: "john@x.com" }).expect(201);
      const tagged = await create({ name: "B", email: "john+promo@x.com" }).expect(201);
      expect(tagged.body.data.dedupHint.candidates).toHaveLength(0);
    });
  });

  describe("GET /dedup-check (§4.2)", () => {
    it("возвращает кандидатов, ничего не создаёт", async () => {
      await create({ name: "John", email: "john@x.com" }).expect(201);
      const before = await prisma.contact.count({ where: { orgId } });

      const res = await dedupCheck("JOHN@x.com  ").expect(200);
      expect(res.body.data.candidates).toHaveLength(1);
      expect(res.body.data.candidates[0].name).toBe("John");

      expect(await prisma.contact.count({ where: { orgId } })).toBe(before); // ничего не создано
    });

    it("нет совпадений → пустой список", async () => {
      const res = await dedupCheck("nobody@x.com").expect(200);
      expect(res.body.data.candidates).toHaveLength(0);
    });

    it("невалидный email → 400", async () => {
      await dedupCheck("not-an-email").expect(400);
    });

    it("смёрженные не попадают в кандидаты (§7.5)", async () => {
      const target = await prisma.contact.create({ data: { orgId, name: "Target" } });
      await prisma.contact.create({
        data: { orgId, name: "Merged", email: "m@x.com", emailNormalized: "m@x.com", mergedIntoId: target.id },
      });
      const res = await dedupCheck("m@x.com").expect(200);
      expect(res.body.data.candidates).toHaveLength(0);
    });

    it("dedup-check по контактам ЧУЖОЙ орги ничего не находит (tenant)", async () => {
      await create({ name: "Mine", email: "shared@x.com" }).expect(201);
      const stranger = await signUp(app);
      const res = await request(app.getHttpServer())
        .get("/v1/contacts/dedup-check?email=shared@x.com")
        .set("Authorization", `Bearer ${stranger.token}`)
        .expect(200);
      expect(res.body.data.candidates).toHaveLength(0);
    });
  });
});
