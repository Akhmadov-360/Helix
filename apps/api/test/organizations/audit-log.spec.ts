import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, type Role } from "@helix/db";
import { createTestApp } from "../helpers/create-test-app";

let counter = 0;

async function signUpAs(app: INestApplication, role: Role = "OWNER"): Promise<{ token: string; userId: string; orgId: string }> {
  const email = `audit${counter++}@example.com`;
  const res = await request(app.getHttpServer())
    .post("/v1/auth/register")
    .send({ email, name: "Founder", password: "correct horse battery staple" })
    .expect(201);
  const token = res.body.data.accessToken as string;
  const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString());
  const userId = payload.sub as string;
  const orgId = payload.activeOrgId as string;
  if (role !== "OWNER") await prisma.membership.updateMany({ where: { user: { email } }, data: { role } });
  return { token, userId, orgId };
}

async function addToOrg(orgId: string, userId: string, role: Role): Promise<void> {
  await prisma.membership.create({ data: { orgId, userId, role } });
}

describe("GET /v1/organizations/audit-log (decisions.md D5)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("membership.role_changed и membership.removed попадают в аудит с актором и снапшотом", async () => {
    const owner = await signUpAs(app);
    const member = await signUpAs(app);
    await addToOrg(owner.orgId, member.userId, "MEMBER");

    await request(app.getHttpServer())
      .patch(`/v1/organizations/members/${member.userId}`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ role: "MANAGER" })
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/v1/organizations/members/${member.userId}`)
      .set("Authorization", `Bearer ${owner.token}`)
      .expect(200);

    const res = await request(app.getHttpServer())
      .get("/v1/organizations/audit-log")
      .set("Authorization", `Bearer ${owner.token}`)
      .expect(200);

    const entries = res.body.data.entries;
    const actions = entries.map((e: { action: string }) => e.action);
    expect(actions).toContain("membership.role_changed");
    expect(actions).toContain("membership.removed");

    const roleChanged = entries.find((e: { action: string }) => e.action === "membership.role_changed");
    expect(roleChanged.actorId).toBe(owner.userId);
    expect(roleChanged.payload).toMatchObject({
      userId: member.userId,
      fromRole: "MEMBER",
      toRole: "MANAGER",
    });

    const removed = entries.find((e: { action: string }) => e.action === "membership.removed");
    expect(removed.payload).toMatchObject({ userId: member.userId, role: "MANAGER" });

    // Свежие сверху.
    expect(entries.indexOf(removed)).toBeLessThan(entries.indexOf(roleChanged));
  });

  it("organization.created пишется в аудит НОВОЙ орги", async () => {
    const founder = await signUpAs(app);

    const created = await request(app.getHttpServer())
      .post("/v1/organizations")
      .set("Authorization", `Bearer ${founder.token}`)
      .send({ name: "Second Org" })
      .expect(201);

    // Токен всё ещё указывает на первую (личную) оргу — читаем аудит второй придётся после
    // switch-org, но здесь достаточно проверить факт записи напрямую через БД (не публичный API).
    const entry = await prisma.auditLog.findFirst({ where: { orgId: created.body.data.orgId } });
    expect(entry?.action).toBe("organization.created");
    expect(entry?.actorId).toBe(founder.userId);
    expect(entry?.payload).toMatchObject({ name: "Second Org" });
  });

  it("MANAGER читает аудит (read = все роли — словарь не секретнее публичного ростера)", async () => {
    const manager = await signUpAs(app, "MANAGER");

    await request(app.getHttpServer())
      .get("/v1/organizations/audit-log")
      .set("Authorization", `Bearer ${manager.token}`)
      .expect(200);
  });

  it("аудит одной орги не виден в другой (tenant-изоляция)", async () => {
    const ownerA = await signUpAs(app);
    const ownerB = await signUpAs(app);
    const member = await signUpAs(app);
    await addToOrg(ownerA.orgId, member.userId, "MEMBER");

    await request(app.getHttpServer())
      .patch(`/v1/organizations/members/${member.userId}`)
      .set("Authorization", `Bearer ${ownerA.token}`)
      .send({ role: "MANAGER" })
      .expect(200);

    const resB = await request(app.getHttpServer())
      .get("/v1/organizations/audit-log")
      .set("Authorization", `Bearer ${ownerB.token}`)
      .expect(200);

    expect(resB.body.data).toEqual({ entries: [], hasMore: false });
  });

  it("фильтр по action отдаёт только совпадающие записи", async () => {
    const owner = await signUpAs(app);
    const member = await signUpAs(app);
    await addToOrg(owner.orgId, member.userId, "MEMBER");

    await request(app.getHttpServer())
      .patch(`/v1/organizations/members/${member.userId}`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ role: "MANAGER" })
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/v1/organizations/members/${member.userId}`)
      .set("Authorization", `Bearer ${owner.token}`)
      .expect(200);

    const res = await request(app.getHttpServer())
      .get("/v1/organizations/audit-log")
      .query({ action: "membership.removed" })
      .set("Authorization", `Bearer ${owner.token}`)
      .expect(200);

    expect(res.body.data.entries).toHaveLength(1);
    expect(res.body.data.entries[0].action).toBe("membership.removed");
  });

  it("пагинация: limit ограничивает страницу, hasMore=true пока есть ещё, cursor листает дальше", async () => {
    const owner = await signUpAs(app);
    // 3 переименования орги-настроек → 3 organization.settings_updated записи (проще всего
    // сгенерить N однотипных событий без лишних акторов).
    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer())
        .patch("/v1/organizations/settings")
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ currency: i % 2 === 0 ? "USD" : "EUR" })
        .expect(200);
    }

    const page1 = await request(app.getHttpServer())
      .get("/v1/organizations/audit-log")
      .query({ limit: 2 })
      .set("Authorization", `Bearer ${owner.token}`)
      .expect(200);
    expect(page1.body.data.entries).toHaveLength(2);
    expect(page1.body.data.hasMore).toBe(true);

    const lastId = page1.body.data.entries[1].id;
    const page2 = await request(app.getHttpServer())
      .get("/v1/organizations/audit-log")
      .query({ limit: 2, cursor: lastId })
      .set("Authorization", `Bearer ${owner.token}`)
      .expect(200);
    expect(page2.body.data.entries).toHaveLength(1);
    expect(page2.body.data.hasMore).toBe(false);
    // Страницы не пересекаются.
    expect(page2.body.data.entries[0].id).not.toBe(lastId);
  });
});
