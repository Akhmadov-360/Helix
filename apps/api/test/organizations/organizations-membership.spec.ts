import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, type Role } from "@helix/db";
import { createTestApp } from "../helpers/create-test-app";

let counter = 0;

async function signUpAs(app: INestApplication, role: Role = "OWNER"): Promise<{ token: string; userId: string; orgId: string }> {
  const email = `org${counter++}@example.com`;
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

describe("Organizations — membership management (Appendix B)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("POST /v1/organizations — доп. организация (FR-ORG-2)", () => {
    it("создаёт новую оргу с создателем как OWNER", async () => {
      const { token, userId } = await signUpAs(app);

      const res = await request(app.getHttpServer())
        .post("/v1/organizations")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Second Org" })
        .expect(201);

      expect(res.body.data.name).toBe("Second Org");
      expect(res.body.data.role).toBe("OWNER");

      const membership = await prisma.membership.findUnique({
        where: { orgId_userId: { orgId: res.body.data.orgId, userId } },
      });
      expect(membership?.role).toBe("OWNER");
    });
  });

  describe("PATCH /v1/organizations/members/:userId — смена роли", () => {
    it("OWNER меняет роль MEMBER на MANAGER", async () => {
      const owner = await signUpAs(app);
      const other = await signUpAs(app);
      await addToOrg(owner.orgId, other.userId, "MEMBER");

      await request(app.getHttpServer())
        .patch(`/v1/organizations/members/${other.userId}`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ role: "MANAGER" })
        .expect(200);

      const membership = await prisma.membership.findUnique({
        where: { orgId_userId: { orgId: owner.orgId, userId: other.userId } },
      });
      expect(membership?.role).toBe("MANAGER");
    });

    it("понизить последнего OWNER → 409", async () => {
      const owner = await signUpAs(app);

      await request(app.getHttpServer())
        .patch(`/v1/organizations/members/${owner.userId}`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ role: "ADMIN" })
        .expect(409);
    });

    it("есть второй OWNER — первого понизить можно", async () => {
      const owner = await signUpAs(app);
      const other = await signUpAs(app);
      await addToOrg(owner.orgId, other.userId, "OWNER");

      await request(app.getHttpServer())
        .patch(`/v1/organizations/members/${owner.userId}`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ role: "MEMBER" })
        .expect(200);
    });

    it("чужой userId (не член орги) → 404", async () => {
      const owner = await signUpAs(app);
      const stranger = await signUpAs(app);

      await request(app.getHttpServer())
        .patch(`/v1/organizations/members/${stranger.userId}`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ role: "MANAGER" })
        .expect(404);
    });

    it("MANAGER не может менять роли → 403", async () => {
      // PoliciesGuard проверяет capability ДО сервиса — своей же роли в своей же орге
      // достаточно, cross-org сетап тут ни при чём (тот же приём, что в blueprints-crud.spec.ts).
      const manager = await signUpAs(app, "MANAGER");

      await request(app.getHttpServer())
        .patch(`/v1/organizations/members/${manager.userId}`)
        .set("Authorization", `Bearer ${manager.token}`)
        .send({ role: "MEMBER" })
        .expect(403);
    });
  });

  describe("DELETE /v1/organizations/members/:userId — удаление участника", () => {
    it("OWNER удаляет MEMBER из орги", async () => {
      const owner = await signUpAs(app);
      const other = await signUpAs(app);
      await addToOrg(owner.orgId, other.userId, "MEMBER");

      await request(app.getHttpServer())
        .delete(`/v1/organizations/members/${other.userId}`)
        .set("Authorization", `Bearer ${owner.token}`)
        .expect(200);

      const membership = await prisma.membership.findUnique({
        where: { orgId_userId: { orgId: owner.orgId, userId: other.userId } },
      });
      expect(membership).toBeNull();
    });

    it("удалить последнего OWNER → 409", async () => {
      const owner = await signUpAs(app);
      const other = await signUpAs(app);
      await addToOrg(owner.orgId, other.userId, "MEMBER");

      await request(app.getHttpServer())
        .delete(`/v1/organizations/members/${owner.userId}`)
        .set("Authorization", `Bearer ${owner.token}`)
        .expect(409);
    });

    it("удалить участника, у которого это единственная орга → 409", async () => {
      const owner = await signUpAs(app);
      // solo регистрируется (заводит личную орга), затем присоединяется к owner.orgId —
      // теперь у неё 2 членства. Убираем личное — остаётся ровно одно: owner.orgId.
      const solo = await signUpAs(app);
      await addToOrg(owner.orgId, solo.userId, "MEMBER");
      await prisma.membership.deleteMany({ where: { userId: solo.userId, orgId: solo.orgId } });

      await request(app.getHttpServer())
        .delete(`/v1/organizations/members/${solo.userId}`)
        .set("Authorization", `Bearer ${owner.token}`)
        .expect(409);
    });

    it("чужой userId (не член орги) → 404", async () => {
      const owner = await signUpAs(app);
      const stranger = await signUpAs(app);

      await request(app.getHttpServer())
        .delete(`/v1/organizations/members/${stranger.userId}`)
        .set("Authorization", `Bearer ${owner.token}`)
        .expect(404);
    });

    it("MEMBER не может удалять участников → 403", async () => {
      const member = await signUpAs(app, "MEMBER");

      await request(app.getHttpServer())
        .delete(`/v1/organizations/members/${member.userId}`)
        .set("Authorization", `Bearer ${member.token}`)
        .expect(403);
    });
  });
});
