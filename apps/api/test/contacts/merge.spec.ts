import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@helix/db";
import { createTestApp } from "../helpers/create-test-app";

let counter = 0;

async function signUp(app: INestApplication): Promise<{ token: string; orgId: string }> {
  const email = `mg${counter++}@example.com`;
  const res = await request(app.getHttpServer())
    .post("/v1/auth/register")
    .send({ email, name: "Mg", password: "correct horse battery staple" })
    .expect(201);
  const token = res.body.data.accessToken as string;
  const orgId = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString()).activeOrgId;
  return { token, orgId };
}

describe("merge контактов (§7, unit 7)", () => {
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

  const seed = (data: Record<string, unknown>) =>
    prisma.contact.create({ data: { orgId, name: "C", ...data } });
  const merge = (targetId: string, sourceId: string) =>
    request(app.getHttpServer())
      .post(`/v1/contacts/${targetId}/merge`)
      .set("Authorization", `Bearer ${token}`)
      .send({ sourceId });
  const auth = (m: request.Test) => m.set("Authorization", `Bearer ${token}`);
  const mergedRecord = () =>
    prisma.auditLog.findFirst({ where: { orgId, action: "contact.merged" } });

  async function seedProject(): Promise<string> {
    const ws = await prisma.workspace.create({ data: { orgId, name: "B" } });
    const phase = await prisma.phase.create({
      data: { workspaceId: ws.id, key: "o", name: { en: "O" }, type: "OPEN", order: 1 },
    });
    const project = await prisma.project.create({
      data: { orgId, workspaceId: ws.id, phaseId: phase.id, title: "L", rank: "a0" },
    });
    return project.id;
  }

  describe("поля — target wins, source заполняет пустоты (§7.2)", () => {
    it("target без email + source с email → target получает email + канон", async () => {
      const target = await seed({ name: "T", email: null });
      const source = await seed({ name: "S", email: "s@x.com", emailNormalized: "s@x.com" });
      const res = await merge(target.id, source.id).expect(200);
      expect(res.body.data.email).toBe("s@x.com");
      const row = await prisma.contact.findUnique({ where: { id: target.id } });
      expect(row?.emailNormalized).toBe("s@x.com"); // пересчитан (§4.3)
    });

    it("оба с разным email → target побеждает, source-email теряется", async () => {
      const target = await seed({ name: "T", email: "t@x.com", emailNormalized: "t@x.com" });
      const source = await seed({ name: "S", email: "s@x.com", emailNormalized: "s@x.com" });
      const res = await merge(target.id, source.id).expect(200);
      expect(res.body.data.email).toBe("t@x.com");
    });

    it("companyId: target пустой берёт source; target заполнен — остаётся target", async () => {
      const co1 = await prisma.company.create({ data: { orgId, name: "One" } });
      const co2 = await prisma.company.create({ data: { orgId, name: "Two" } });

      const t1 = await seed({ name: "T", companyId: null });
      const s1 = await seed({ name: "S", companyId: co1.id });
      expect((await merge(t1.id, s1.id).expect(200)).body.data.companyId).toBe(co1.id);

      const t2 = await seed({ name: "T", companyId: co1.id });
      const s2 = await seed({ name: "S", companyId: co2.id });
      expect((await merge(t2.id, s2.id).expect(200)).body.data.companyId).toBe(co1.id); // target
    });

    it("name всегда остаётся target", async () => {
      const target = await seed({ name: "KeepMe" });
      const source = await seed({ name: "Discard" });
      expect((await merge(target.id, source.id).expect(200)).body.data.name).toBe("KeepMe");
    });
  });

  describe("погашение + аудит (§7.3, P4)", () => {
    it("source.mergedIntoId = target, физически не удалён", async () => {
      const target = await seed({ name: "T" });
      const source = await seed({ name: "S" });
      await merge(target.id, source.id).expect(200);
      const row = await prisma.contact.findUnique({ where: { id: source.id } });
      expect(row).not.toBeNull();
      expect(row?.mergedIntoId).toBe(target.id);
    });

    it("AuditLog contact.merged записан, payload со снапшотом", async () => {
      const target = await seed({ name: "T", email: null });
      const source = await seed({ name: "SourceName", email: "s@x.com", emailNormalized: "s@x.com" });
      await merge(target.id, source.id).expect(200);

      const rec = await mergedRecord();
      expect(rec).not.toBeNull();
      const p = rec?.payload as Record<string, unknown>;
      expect(p.sourceId).toBe(source.id);
      expect(p.sourceName).toBe("SourceName");
      expect(p.targetId).toBe(target.id);
      expect(p.fieldsFilledFromSource).toContain("email");
      expect(Array.isArray(p.movedProjectContactIds)).toBe(true);
      expect(p.schemaVersion).toBe(1);
    });

    it("merge НЕ пишет в ActivityEvent, существующие события лида целы (P2)", async () => {
      const projectId = await seedProject();
      await prisma.activityEvent.create({
        data: { orgId, projectId, type: "project.created", actorId: null, payload: {} },
      });
      const before = await prisma.activityEvent.count({ where: { orgId } });

      const target = await seed({ name: "T" });
      const source = await seed({ name: "S" });
      await merge(target.id, source.id).expect(200);

      expect(await prisma.activityEvent.count({ where: { orgId } })).toBe(before); // не тронут
    });

    it("откат транзакции (merge в смёрженного) → записи в AuditLog нет", async () => {
      const target = await seed({ name: "T" });
      const source = await seed({ name: "S" });
      await merge(target.id, source.id).expect(200); // 1 запись
      const other = await seed({ name: "X" });
      await merge(other.id, source.id).expect(409); // source уже смёржен → откат
      expect(await prisma.auditLog.count({ where: { orgId } })).toBe(1); // второй не добавил
    });
  });

  describe("редирект связей ProjectContact (§7.3)", () => {
    it("перенос + union roles на дубле, orgId консистентен", async () => {
      const p1 = await seedProject();
      const p2 = await seedProject();
      const target = await seed({ name: "T" });
      const source = await seed({ name: "S" });

      // p1: только source; p2: и source, и target (дубль)
      await prisma.projectContact.create({ data: { projectId: p1, contactId: source.id, orgId, roles: ["CHAMPION"] } });
      await prisma.projectContact.create({ data: { projectId: p2, contactId: source.id, orgId, roles: ["INFLUENCER"] } });
      await prisma.projectContact.create({ data: { projectId: p2, contactId: target.id, orgId, roles: ["DECISION_MAKER"] } });

      await merge(target.id, source.id).expect(200);

      // source-строк не осталось
      expect(await prisma.projectContact.count({ where: { contactId: source.id } })).toBe(0);
      // p1: target перенесён, роль сохранена, orgId цел
      const l1 = await prisma.projectContact.findUnique({
        where: { projectId_contactId: { projectId: p1, contactId: target.id } },
      });
      expect(l1?.roles).toEqual(["CHAMPION"]);
      expect(l1?.orgId).toBe(orgId);
      // p2: union ролей
      const l2 = await prisma.projectContact.findUnique({
        where: { projectId_contactId: { projectId: p2, contactId: target.id } },
      });
      expect(new Set(l2?.roles)).toEqual(new Set(["DECISION_MAKER", "INFLUENCER"]));
    });
  });

  describe("единый 410 на смёрженного (§7.5)", () => {
    let mergedId: string;
    let targetId: string;
    beforeEach(async () => {
      const target = await seed({ name: "T" });
      const source = await seed({ name: "S" });
      await merge(target.id, source.id).expect(200);
      mergedId = source.id;
      targetId = target.id;
    });

    it("GET смёрженного → 410 + mergedIntoId", async () => {
      const res = await auth(request(app.getHttpServer()).get(`/v1/contacts/${mergedId}`)).expect(410);
      expect(res.body.error.details.mergedIntoId).toBe(targetId);
    });

    it("PATCH смёрженного → 410", async () => {
      await auth(request(app.getHttpServer()).patch(`/v1/contacts/${mergedId}`).send({ name: "X" })).expect(410);
    });

    it("DELETE смёрженного → 410", async () => {
      await auth(request(app.getHttpServer()).delete(`/v1/contacts/${mergedId}`)).expect(410);
    });
  });

  describe("инварианты и отказы (§7.1/§7.4)", () => {
    it("source === target → 400", async () => {
      const c = await seed({ name: "C" });
      await merge(c.id, c.id).expect(400);
    });

    it("merge X → уже-смёрженный target → 409", async () => {
      const target = await seed({ name: "T" });
      const source = await seed({ name: "S" });
      await merge(target.id, source.id).expect(200); // target активен, source погашен
      const x = await seed({ name: "X" });
      await merge(source.id, x.id).expect(409); // source (теперь target пути) смёржен → 409
    });

    it("цепочка: смёрженный как source → 409", async () => {
      const target = await seed({ name: "T" });
      const source = await seed({ name: "S" });
      await merge(target.id, source.id).expect(200);
      const other = await seed({ name: "O" });
      await merge(other.id, source.id).expect(409);
    });

    it("чужой контакт (source из другой орги) → 404", async () => {
      const target = await seed({ name: "T" });
      const stranger = await signUp(app);
      const foreign = await prisma.contact.create({ data: { orgId: stranger.orgId, name: "F" } });
      await merge(target.id, foreign.id).expect(404);
    });

    // merge = Owner/Admin (отдельный action, строже delete=Manager+): Member И Manager → 403.
    it("Member merge → 403", async () => {
      const target = await seed({ name: "T" });
      const source = await seed({ name: "S" });
      await prisma.membership.updateMany({ data: { role: "MEMBER" } });
      await merge(target.id, source.id).expect(403);
    });

    it("Manager merge → 403 (merge = Owner/Admin, не Manager)", async () => {
      const target = await seed({ name: "T" });
      const source = await seed({ name: "S" });
      await prisma.membership.updateMany({ data: { role: "MANAGER" } });
      await merge(target.id, source.id).expect(403);
    });
  });

  describe("гонки (§7.4)", () => {
    it("два параллельных merge одного source → один 200, второй 409", async () => {
      const t1 = await seed({ name: "T1" });
      const t2 = await seed({ name: "T2" });
      const source = await seed({ name: "S" });
      const [r1, r2] = await Promise.all([merge(t1.id, source.id), merge(t2.id, source.id)]);
      const codes = [r1.status, r2.status].sort();
      expect(codes).toEqual([200, 409]);
    });

    it("анти-дедлок: встречные A→B и B→A → без 500, один 200, второй 409", async () => {
      const a = await seed({ name: "A" });
      const b = await seed({ name: "B" });
      const [r1, r2] = await Promise.all([merge(a.id, b.id), merge(b.id, a.id)]);
      expect(r1.status).not.toBe(500);
      expect(r2.status).not.toBe(500);
      expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    });
  });
});
