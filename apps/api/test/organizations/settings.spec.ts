import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, type Role } from "@helix/db";
import { createTestApp } from "../helpers/create-test-app";

let counter = 0;

async function signUpAs(app: INestApplication, role: Role = "OWNER"): Promise<{ token: string; userId: string; orgId: string }> {
  const email = `settings${counter++}@example.com`;
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

describe("FR-ORG-3 — org-level settings", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("GET /v1/organizations/settings", () => {
    it("свежая орга — пустой объект settings", async () => {
      const { token, orgId } = await signUpAs(app);

      const res = await request(app.getHttpServer())
        .get("/v1/organizations/settings")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body.data).toEqual({ orgId, name: "Founder", settings: {} });
    });

    it("читают все роли, не только O/A", async () => {
      const { token } = await signUpAs(app, "VIEWER");

      await request(app.getHttpServer())
        .get("/v1/organizations/settings")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
    });

    it("без токена → 401", async () => {
      await request(app.getHttpServer()).get("/v1/organizations/settings").expect(401);
    });
  });

  describe("PATCH /v1/organizations/settings", () => {
    it("OWNER сохраняет currency+timezone, читается назад", async () => {
      const { token, orgId } = await signUpAs(app);

      const res = await request(app.getHttpServer())
        .patch("/v1/organizations/settings")
        .set("Authorization", `Bearer ${token}`)
        .send({ currency: "USD", timezone: "Asia/Tashkent" })
        .expect(200);

      expect(res.body.data).toEqual({
        orgId,
        name: "Founder",
        settings: { currency: "USD", timezone: "Asia/Tashkent" },
      });
    });

    it("партиальный merge — второй PATCH не стирает поля первого", async () => {
      const { token } = await signUpAs(app);

      await request(app.getHttpServer())
        .patch("/v1/organizations/settings")
        .set("Authorization", `Bearer ${token}`)
        .send({ currency: "USD" })
        .expect(200);

      const res = await request(app.getHttpServer())
        .patch("/v1/organizations/settings")
        .set("Authorization", `Bearer ${token}`)
        .send({ branding: { primaryColor: "#1a2b3c" } })
        .expect(200);

      expect(res.body.data.settings).toEqual({
        currency: "USD",
        branding: { primaryColor: "#1a2b3c" },
      });
    });

    it("ADMIN тоже может обновлять", async () => {
      const admin = await signUpAs(app, "ADMIN");

      await request(app.getHttpServer())
        .patch("/v1/organizations/settings")
        .set("Authorization", `Bearer ${admin.token}`)
        .send({ currency: "EUR" })
        .expect(200);
    });

    it("MANAGER → 403", async () => {
      const manager = await signUpAs(app, "MANAGER");

      await request(app.getHttpServer())
        .patch("/v1/organizations/settings")
        .set("Authorization", `Bearer ${manager.token}`)
        .send({ currency: "EUR" })
        .expect(403);
    });

    it("MEMBER → 403", async () => {
      const member = await signUpAs(app, "MEMBER");

      await request(app.getHttpServer())
        .patch("/v1/organizations/settings")
        .set("Authorization", `Bearer ${member.token}`)
        .send({ currency: "EUR" })
        .expect(403);
    });

    it("невалидная currency (не ISO 4217) → 400", async () => {
      const { token } = await signUpAs(app);

      await request(app.getHttpServer())
        .patch("/v1/organizations/settings")
        .set("Authorization", `Bearer ${token}`)
        .send({ currency: "us-dollars" })
        .expect(400);
    });

    it("невалидный primaryColor → 400", async () => {
      const { token } = await signUpAs(app);

      await request(app.getHttpServer())
        .patch("/v1/organizations/settings")
        .set("Authorization", `Bearer ${token}`)
        .send({ branding: { primaryColor: "blue" } })
        .expect(400);
    });

    it("пишет organization.settings_updated в аудит с изменившимися ключами", async () => {
      const { token, orgId } = await signUpAs(app);

      await request(app.getHttpServer())
        .patch("/v1/organizations/settings")
        .set("Authorization", `Bearer ${token}`)
        .send({ currency: "USD", timezone: "Asia/Tashkent" })
        .expect(200);

      const entry = await prisma.auditLog.findFirstOrThrow({
        where: { orgId, action: "organization.settings_updated" },
      });
      expect(entry.payload).toEqual({
        schemaVersion: 1,
        changedKeys: expect.arrayContaining(["currency", "timezone"]),
      });
      expect((entry.payload as { changedKeys: string[] }).changedKeys).toHaveLength(2);
    });

    it("PATCH без реальных изменений (то же значение) не пишет лишнюю запись аудита", async () => {
      const { token, orgId } = await signUpAs(app);

      await request(app.getHttpServer())
        .patch("/v1/organizations/settings")
        .set("Authorization", `Bearer ${token}`)
        .send({ currency: "USD" })
        .expect(200);

      await request(app.getHttpServer())
        .patch("/v1/organizations/settings")
        .set("Authorization", `Bearer ${token}`)
        .send({ currency: "USD" })
        .expect(200);

      const entries = await prisma.auditLog.findMany({
        where: { orgId, action: "organization.settings_updated" },
      });
      expect(entries).toHaveLength(1);
    });

    it("без токена → 401", async () => {
      await request(app.getHttpServer())
        .patch("/v1/organizations/settings")
        .send({ currency: "USD" })
        .expect(401);
    });

    it("OWNER меняет name — читается назад, не попадает в settings JSON", async () => {
      const { token, orgId } = await signUpAs(app);

      const res = await request(app.getHttpServer())
        .patch("/v1/organizations/settings")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Acme Corp", currency: "USD" })
        .expect(200);

      expect(res.body.data).toEqual({ orgId, name: "Acme Corp", settings: { currency: "USD" } });

      const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
      expect(org.name).toBe("Acme Corp");
    });

    it("пустое name → 400", async () => {
      const { token } = await signUpAs(app);

      await request(app.getHttpServer())
        .patch("/v1/organizations/settings")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "" })
        .expect(400);
    });

    it("смена name попадает в changedKeys аудита", async () => {
      const { token, orgId } = await signUpAs(app);

      await request(app.getHttpServer())
        .patch("/v1/organizations/settings")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Acme Corp" })
        .expect(200);

      const entry = await prisma.auditLog.findFirstOrThrow({
        where: { orgId, action: "organization.settings_updated" },
      });
      expect((entry.payload as { changedKeys: string[] }).changedKeys).toEqual(["name"]);
    });
  });
});
