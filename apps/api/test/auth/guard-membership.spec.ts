import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@helix/db";
import { createTestApp } from "../helpers/create-test-app";

const USER = {
  email: "member@example.com",
  name: "Test Member",
  password: "correct horse battery staple",
};

/**
 * Проверяет ГЛАВНОЕ следствие решения «role не в токене» (§6): права читаются
 * из Membership на каждом запросе, поэтому изменения действуют немедленно,
 * а не после истечения access-токена.
 */
describe("JwtAuthGuard — членство и роль читаются свежими", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const signUp = async (): Promise<{ accessToken: string; userId: string }> => {
    const res = await request(app.getHttpServer())
      .post("/v1/auth/register")
      .send(USER)
      .expect(201);
    return {
      accessToken: res.body.data.accessToken as string,
      userId: res.body.data.user.id as string,
    };
  };

  const me = (accessToken: string) =>
    request(app.getHttpServer()).get("/v1/auth/me").set("Authorization", `Bearer ${accessToken}`);

  it("после регистрации роль в личной орге — OWNER", async () => {
    const { accessToken } = await signUp();
    const res = await me(accessToken).expect(200);

    expect(res.body.data.role).toBe("OWNER");
  });

  it("ПОНИЖЕНИЕ роли действует немедленно, с тем же токеном", async () => {
    const { accessToken, userId } = await signUp();
    expect((await me(accessToken).expect(200)).body.data.role).toBe("OWNER");

    await prisma.membership.updateMany({ where: { userId }, data: { role: "MEMBER" } });

    // Токен не менялся. Если бы роль лежала в JWT, здесь ещё 15 минут был бы OWNER —
    // это и есть stale authorization, ради избежания которого роль читается из БД.
    expect((await me(accessToken).expect(200)).body.data.role).toBe("MEMBER");
  });

  it("ИСКЛЮЧЕНИЕ из орги закрывает доступ СРАЗУ, а не через 15 минут", async () => {
    const { accessToken, userId } = await signUp();
    await me(accessToken).expect(200);

    await prisma.membership.deleteMany({ where: { userId } });

    const res = await me(accessToken).expect(403);
    expect(res.body).toMatchObject({
      success: false,
      error: { code: "NOT_ORG_MEMBER" },
    });
  });

  it("токен на оргу, где членства нет, отвергается", async () => {
    const { accessToken, userId } = await signUp();

    // Юзера переносим в другую оргу: токен по-прежнему указывает на старую.
    const other = await prisma.organization.create({ data: { name: "Another Org" } });
    await prisma.membership.deleteMany({ where: { userId } });
    await prisma.membership.create({ data: { orgId: other.id, userId, role: "ADMIN" } });

    // Подпись валидна, личность верна — но действовать от имени той орги нельзя.
    await me(accessToken).expect(403);
  });

  it("/me отдаёт активную оргу из токена", async () => {
    const { accessToken, userId } = await signUp();
    const membership = await prisma.membership.findFirst({ where: { userId } });

    const res = await me(accessToken).expect(200);
    expect(res.body.data.activeOrgId).toBe(membership?.orgId);
  });
});
