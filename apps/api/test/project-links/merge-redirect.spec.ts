import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@helix/db";
import { createTestApp } from "../helpers/create-test-app";

let counter = 0;

async function signUp(app: INestApplication): Promise<{ token: string; orgId: string }> {
  const email = `mr${counter++}@example.com`;
  const res = await request(app.getHttpServer())
    .post("/v1/auth/register")
    .send({ email, name: "Mr", password: "correct horse battery staple" })
    .expect(201);
  const token = res.body.data.accessToken as string;
  const orgId = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString()).activeOrgId;
  return { token, orgId };
}

/**
 * СТЫК срезов (project-links.md §7): merge контактов (contacts.md §7.3) переводит
 * ProjectContact.contactId source→target. Таблица наполнена этим срезом — заготовки оживают.
 * Если union-ролей краснеет — баг в MERGE (contacts срез), не здесь (§7).
 */
describe("merge-редирект ProjectContact (§7 стык)", () => {
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

  const seedContact = (name: string) => prisma.contact.create({ data: { orgId, name } });
  const merge = (targetId: string, sourceId: string) =>
    request(app.getHttpServer())
      .post(`/v1/contacts/${targetId}/merge`)
      .set("Authorization", `Bearer ${token}`)
      .send({ sourceId });
  const listContacts = (pid: string) =>
    request(app.getHttpServer()).get(`/v1/projects/${pid}/contacts`).set("Authorization", `Bearer ${token}`);
  const link = (pid: string, contactId: string, roles: string[]) =>
    request(app.getHttpServer()).post(`/v1/projects/${pid}/contacts`).set("Authorization", `Bearer ${token}`).send({ contactId, roles });

  async function makeProject(): Promise<string> {
    const ws = (
      await request(app.getHttpServer()).post("/v1/workspaces").set("Authorization", `Bearer ${token}`).send({ name: "B" }).expect(201)
    ).body.data;
    return (
      await request(app.getHttpServer())
        .post(`/v1/workspaces/${ws.id}/projects`)
        .set("Authorization", `Bearer ${token}`)
        .send({ title: "L" })
        .expect(201)
    ).body.data.id;
  }

  it("контакты в РАЗНЫХ проектах → contactId перенесён на target, orgId цел", async () => {
    const p1 = await makeProject();
    const p2 = await makeProject();
    const target = await seedContact("T");
    const source = await seedContact("S");
    await link(p1, target.id, ["CHAMPION"]).expect(201);
    await link(p2, source.id, ["BLOCKER"]).expect(201);

    await merge(target.id, source.id).expect(200);

    // p2 теперь показывает target (source перенесён), source-строк не осталось
    const p2contacts = (await listContacts(p2).expect(200)).body.data;
    expect(p2contacts.map((c: { contactId: string }) => c.contactId)).toEqual([target.id]);
    expect(await prisma.projectContact.count({ where: { contactId: source.id } })).toBe(0);
    // composite-FK держится: orgId строки цел
    const moved = await prisma.projectContact.findFirst({ where: { projectId: p2, contactId: target.id } });
    expect(moved?.orgId).toBe(orgId);
  });

  it("ОБА в одном проекте → union ролей, дублей нет, source-строка удалена", async () => {
    const p = await makeProject();
    const target = await seedContact("T");
    const source = await seedContact("S");
    await link(p, target.id, ["CHAMPION"]).expect(201);
    await link(p, source.id, ["BLOCKER"]).expect(201);

    await merge(target.id, source.id).expect(200);

    const contacts = (await listContacts(p).expect(200)).body.data;
    expect(contacts).toHaveLength(1); // одна строка, не две
    expect(contacts[0].contactId).toBe(target.id);
    expect(new Set(contacts[0].roles)).toEqual(new Set(["CHAMPION", "BLOCKER"]));
  });

  // Union edge-cases (§9, ревьюер ⑤): dedupe по значению enum, пустые множества.
  it.each([
    { target: [], source: ["CHAMPION"], expected: ["CHAMPION"] },
    { target: [], source: [], expected: [] },
    { target: ["CHAMPION"], source: ["CHAMPION"], expected: ["CHAMPION"] }, // dedupe, не дубль
    { target: ["CHAMPION"], source: ["BLOCKER"], expected: ["CHAMPION", "BLOCKER"] },
  ])("union $target + $source → $expected", async ({ target: tRoles, source: sRoles, expected }) => {
    const p = await makeProject();
    const target = await seedContact("T");
    const source = await seedContact("S");
    await link(p, target.id, tRoles).expect(201);
    await link(p, source.id, sRoles).expect(201);

    await merge(target.id, source.id).expect(200);

    const contacts = (await listContacts(p).expect(200)).body.data;
    expect(contacts).toHaveLength(1);
    expect(new Set(contacts[0].roles)).toEqual(new Set(expected));
  });

  it("movedProjectContactIds в AuditLog содержит перенесённые проекты", async () => {
    const p1 = await makeProject();
    const p2 = await makeProject();
    const target = await seedContact("T");
    const source = await seedContact("S");
    await link(p1, source.id, ["CHAMPION"]).expect(201);
    await link(p2, source.id, ["BLOCKER"]).expect(201);

    await merge(target.id, source.id).expect(200);

    const rec = await prisma.auditLog.findFirst({ where: { orgId, action: "contact.merged" } });
    const moved = (rec?.payload as { movedProjectContactIds: string[] }).movedProjectContactIds;
    expect(new Set(moved)).toEqual(new Set([p1, p2]));
  });
});
