import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@helix/db";
import { REFRESH_COOKIE_NAME } from "../../src/modules/auth/sessions/refresh-cookie.service";
import { createTestApp } from "../helpers/create-test-app";

const USER = {
  email: "member@example.com",
  name: "Test Member",
  password: "correct horse battery staple",
};

function cookieFrom(res: request.Response): string {
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

describe("POST /v1/auth/switch-org", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  interface Signed {
    accessToken: string;
    cookie: string;
    userId: string;
    personalOrgId: string;
  }

  const signUp = async (): Promise<Signed> => {
    const res = await request(app.getHttpServer())
      .post("/v1/auth/register")
      .send(USER)
      .expect(201);

    return {
      accessToken: res.body.data.accessToken as string,
      cookie: cookieFrom(res),
      userId: res.body.data.user.id as string,
      personalOrgId: orgIdFrom(res.body.data.accessToken as string),
    };
  };

  /** Вторая орга, куда юзера приглашают (инвайтов ещё нет — заводим напрямую). */
  const addToSecondOrg = async (userId: string, role: "ADMIN" | "VIEWER" = "ADMIN") => {
    const org = await prisma.organization.create({ data: { name: "Second Org" } });
    await prisma.membership.create({ data: { orgId: org.id, userId, role } });
    return org.id;
  };

  it("выдаёт токен для другой орги, если членство есть", async () => {
    const me = await signUp();
    const secondOrgId = await addToSecondOrg(me.userId);

    const res = await request(app.getHttpServer())
      .post("/v1/auth/switch-org")
      .set("Authorization", `Bearer ${me.accessToken}`)
      .send({ orgId: secondOrgId })
      .expect(200);

    expect(orgIdFrom(res.body.data.accessToken)).toBe(secondOrgId);
    expect(orgIdFrom(res.body.data.accessToken)).not.toBe(me.personalOrgId);
  });

  it("новым токеном /me показывает новую оргу и роль в ней", async () => {
    const me = await signUp();
    const secondOrgId = await addToSecondOrg(me.userId, "VIEWER");

    const switched = await request(app.getHttpServer())
      .post("/v1/auth/switch-org")
      .set("Authorization", `Bearer ${me.accessToken}`)
      .send({ orgId: secondOrgId })
      .expect(200);

    const profile = await request(app.getHttpServer())
      .get("/v1/auth/me")
      .set("Authorization", `Bearer ${switched.body.data.accessToken}`)
      .expect(200);

    expect(profile.body.data.activeOrgId).toBe(secondOrgId);
    // Роль в каждой орге своя: OWNER в личной, VIEWER во второй.
    expect(profile.body.data.role).toBe("VIEWER");
  });

  it("запоминает выбор — следующий refresh возвращает в новую оргу", async () => {
    const me = await signUp();
    const secondOrgId = await addToSecondOrg(me.userId);

    await request(app.getHttpServer())
      .post("/v1/auth/switch-org")
      .set("Authorization", `Bearer ${me.accessToken}`)
      .set("Cookie", me.cookie)
      .send({ orgId: secondOrgId })
      .expect(200);

    const refreshed = await request(app.getHttpServer())
      .post("/v1/auth/refresh")
      .set("Cookie", me.cookie)
      .expect(200);

    // Без сохранения lastActiveOrgId юзера отбросило бы в личную оргу.
    expect(orgIdFrom(refreshed.body.data.accessToken)).toBe(secondOrgId);
  });

  it("старый токен продолжает действовать в СТАРОЙ орге", async () => {
    const me = await signUp();
    const secondOrgId = await addToSecondOrg(me.userId);

    await request(app.getHttpServer())
      .post("/v1/auth/switch-org")
      .set("Authorization", `Bearer ${me.accessToken}`)
      .send({ orgId: secondOrgId })
      .expect(200);

    // Смена орги не отзывает выданные токены — они stateless. Каждый действует
    // в той орге, на которую подписан.
    const profile = await request(app.getHttpServer())
      .get("/v1/auth/me")
      .set("Authorization", `Bearer ${me.accessToken}`)
      .expect(200);

    expect(profile.body.data.activeOrgId).toBe(me.personalOrgId);
  });

  describe("отказы", () => {
    it("без членства в целевой орге → 403 NOT_ORG_MEMBER", async () => {
      const me = await signUp();
      const foreign = await prisma.organization.create({ data: { name: "Someone Else Org" } });

      const res = await request(app.getHttpServer())
        .post("/v1/auth/switch-org")
        .set("Authorization", `Bearer ${me.accessToken}`)
        .send({ orgId: foreign.id })
        .expect(403);

      expect(res.body).toMatchObject({
        success: false,
        error: { code: "NOT_ORG_MEMBER" },
      });
    });

    it("несуществующая орга → 403 (членства всё равно нет)", async () => {
      const me = await signUp();

      await request(app.getHttpServer())
        .post("/v1/auth/switch-org")
        .set("Authorization", `Bearer ${me.accessToken}`)
        .send({ orgId: "org_does_not_exist" })
        .expect(403);
    });

    it("без аутентификации → 401", async () => {
      const me = await signUp();
      const secondOrgId = await addToSecondOrg(me.userId);

      await request(app.getHttpServer())
        .post("/v1/auth/switch-org")
        .send({ orgId: secondOrgId })
        .expect(401);
    });

    it("пустой orgId → 400", async () => {
      const me = await signUp();

      await request(app.getHttpServer())
        .post("/v1/auth/switch-org")
        .set("Authorization", `Bearer ${me.accessToken}`)
        .send({ orgId: "" })
        .expect(400);
    });
  });
});
