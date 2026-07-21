import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@helix/db";
import { REFRESH_COOKIE_NAME } from "../../src/auth/refresh-cookie.service";
import { createTestApp } from "../helpers/create-test-app";

const REGISTRATION = {
  email: "member@example.com",
  name: "Test Member",
  password: "correct horse battery staple",
};

function refreshCookieFrom(res: request.Response): string {
  const raw = res.headers["set-cookie"] as unknown as string[] | undefined;
  const cookie = raw?.find((c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`));
  if (!cookie) throw new Error("refresh cookie not set");
  return cookie.split(";")[0] ?? "";
}

function orgIdFrom(accessToken: string): string {
  const claims = JSON.parse(
    Buffer.from(accessToken.split(".")[1] ?? "", "base64url").toString("utf8"),
  ) as { activeOrgId: string };
  return claims.activeOrgId;
}

describe("POST /v1/auth/refresh", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  /** Регистрирует юзера и отдаёт refresh-cookie + исходный access. */
  const signUp = async (): Promise<{ cookie: string; accessToken: string }> => {
    const res = await request(app.getHttpServer())
      .post("/v1/auth/register")
      .send(REGISTRATION)
      .expect(201);

    return { cookie: refreshCookieFrom(res), accessToken: res.body.data.accessToken as string };
  };

  it("по живой сессии выдаёт новый access-токен", async () => {
    const { cookie, accessToken } = await signUp();

    const res = await request(app.getHttpServer())
      .post("/v1/auth/refresh")
      .set("Cookie", cookie)
      .expect(200);

    expect(typeof res.body.data.accessToken).toBe("string");
    // jti случаен на каждый выпуск → новый токен не может совпасть со старым.
    expect(res.body.data.accessToken).not.toBe(accessToken);
  });

  it("новый access работает на защищённой ручке", async () => {
    const { cookie } = await signUp();

    const refreshed = await request(app.getHttpServer())
      .post("/v1/auth/refresh")
      .set("Cookie", cookie)
      .expect(200);

    await request(app.getHttpServer())
      .get("/v1/auth/me")
      .set("Authorization", `Bearer ${refreshed.body.data.accessToken}`)
      .expect(200);
  });

  it("сохраняет активную оргу из сессии", async () => {
    const { cookie, accessToken } = await signUp();

    const res = await request(app.getHttpServer())
      .post("/v1/auth/refresh")
      .set("Cookie", cookie)
      .expect(200);

    expect(orgIdFrom(res.body.data.accessToken)).toBe(orgIdFrom(accessToken));
  });

  it("отдаёт свежий профиль из БД, а не из старого токена", async () => {
    const { cookie } = await signUp();

    await prisma.user.update({
      where: { email: REGISTRATION.email },
      data: { name: "Renamed During Session" },
    });

    const res = await request(app.getHttpServer())
      .post("/v1/auth/refresh")
      .set("Cookie", cookie)
      .expect(200);

    expect(res.body.data.user.name).toBe("Renamed During Session");
  });

  it("обновляет lastUsedAt сессии", async () => {
    const { cookie } = await signUp();
    expect((await prisma.refreshSession.findFirst())?.lastUsedAt).toBeNull();

    await request(app.getHttpServer()).post("/v1/auth/refresh").set("Cookie", cookie).expect(200);

    expect((await prisma.refreshSession.findFirst())?.lastUsedAt).toBeInstanceOf(Date);
  });

  describe("отказы", () => {
    it("без cookie → 401 INVALID_REFRESH_TOKEN", async () => {
      const res = await request(app.getHttpServer()).post("/v1/auth/refresh").expect(401);

      expect(res.body).toMatchObject({
        success: false,
        error: { code: "INVALID_REFRESH_TOKEN" },
      });
    });

    it("с несуществующим токеном → 401", async () => {
      await request(app.getHttpServer())
        .post("/v1/auth/refresh")
        .set("Cookie", `${REFRESH_COOKIE_NAME}=totally-made-up-token-value`)
        .expect(401);
    });

    it("с пустым значением cookie → 401", async () => {
      await request(app.getHttpServer())
        .post("/v1/auth/refresh")
        .set("Cookie", `${REFRESH_COOKIE_NAME}=`)
        .expect(401);
    });

    it("с истёкшей сессией → 401", async () => {
      const { cookie } = await signUp();
      await prisma.refreshSession.updateMany({
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      await request(app.getHttpServer()).post("/v1/auth/refresh").set("Cookie", cookie).expect(401);
    });

    it("с отозванной сессией → 401 (задел под logout)", async () => {
      const { cookie } = await signUp();
      await prisma.refreshSession.updateMany({
        data: { revokedAt: new Date(), revokedReason: "LOGOUT" },
      });

      await request(app.getHttpServer()).post("/v1/auth/refresh").set("Cookie", cookie).expect(401);
    });

    it("с уже потраченным токеном → 401 (задел под reuse detection)", async () => {
      const { cookie } = await signUp();
      await prisma.refreshSession.updateMany({ data: { usedAt: new Date() } });

      // На шаге 7 этот же случай дополнительно убьёт всю семью.
      await request(app.getHttpServer()).post("/v1/auth/refresh").set("Cookie", cookie).expect(401);
    });

    it("после удаления пользователя → 401", async () => {
      const { cookie } = await signUp();
      await prisma.user.deleteMany({});

      await request(app.getHttpServer()).post("/v1/auth/refresh").set("Cookie", cookie).expect(401);
    });

    it("причина отказа наружу не раскрывается", async () => {
      const { cookie } = await signUp();
      const notFound = await request(app.getHttpServer())
        .post("/v1/auth/refresh")
        .set("Cookie", `${REFRESH_COOKIE_NAME}=nonexistent`)
        .expect(401);

      await prisma.refreshSession.updateMany({ data: { revokedAt: new Date() } });
      const revoked = await request(app.getHttpServer())
        .post("/v1/auth/refresh")
        .set("Cookie", cookie)
        .expect(401);

      expect(notFound.body.error).toEqual(revoked.body.error);
    });
  });
});
