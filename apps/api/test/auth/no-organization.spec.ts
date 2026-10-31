import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@helix/db";
import { REFRESH_COOKIE_NAME } from "../../src/modules/auth/sessions/refresh-cookie.service";
import { createTestApp } from "../helpers/create-test-app";

const PASSWORD = "correct horse battery staple";
let counter = 0;

function cookieFrom(res: request.Response): string {
  const raw = res.headers["set-cookie"] as unknown as string[] | undefined;
  const cookie = raw?.find((c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`));
  if (!cookie) throw new Error("refresh cookie not set");
  return cookie.split(";")[0] ?? "";
}

function claimsOf(accessToken: string): { sub: string; activeOrgId: string | null } {
  return JSON.parse(Buffer.from(accessToken.split(".")[1] ?? "", "base64url").toString("utf8"));
}

describe("аккаунт без организации", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  interface Orphan {
    email: string;
    userId: string;
    accessToken: string;
    cookie: string;
  }

  const registerWithoutOrg = async (): Promise<Orphan> => {
    const email = `orphan${counter++}@example.com`;
    const res = await request(app.getHttpServer())
      .post("/v1/auth/register")
      .send({ email, name: "Orphan", password: PASSWORD })
      .expect(201);
    const userId = res.body.data.user.id as string;
    await prisma.membership.deleteMany({ where: { userId } });
    const login = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .send({ email, password: PASSWORD })
      .expect(200);
    return { email, userId, accessToken: login.body.data.accessToken as string, cookie: cookieFrom(login) };
  };

  const bearer = (token: string): [string, string] => ["Authorization", `Bearer ${token}`];

  it("login без членств: 200 и токен без активной организации", async () => {
    const { accessToken, userId } = await registerWithoutOrg();

    expect(claimsOf(accessToken)).toMatchObject({ sub: userId, activeOrgId: null });
  });

  it("refresh без членств: 200 и токен без активной организации", async () => {
    const { cookie, userId } = await registerWithoutOrg();

    const res = await request(app.getHttpServer())
      .post("/v1/auth/refresh")
      .set("Cookie", cookie)
      .expect(200);

    expect(claimsOf(res.body.data.accessToken)).toMatchObject({ sub: userId, activeOrgId: null });
  });

  it("GET /auth/me: профиль с activeOrgId, role = null и пустыми capabilities", async () => {
    const { accessToken, userId } = await registerWithoutOrg();

    const res = await request(app.getHttpServer())
      .get("/v1/auth/me")
      .set(...bearer(accessToken))
      .expect(200);

    expect(res.body.data).toMatchObject({ id: userId, activeOrgId: null, role: null, capabilities: [] });
  });

  it("GET /organizations/mine: пустой список", async () => {
    const { accessToken } = await registerWithoutOrg();

    const res = await request(app.getHttpServer())
      .get("/v1/organizations/mine")
      .set(...bearer(accessToken))
      .expect(200);

    expect(res.body.data).toEqual([]);
  });

  it.each(["/v1/organizations/members", "/v1/organizations/settings", "/v1/workspaces"])(
    "GET %s: 403 NO_ACTIVE_ORG",
    async (path) => {
      const { accessToken } = await registerWithoutOrg();

      const res = await request(app.getHttpServer())
        .get(path)
        .set(...bearer(accessToken))
        .expect(403);

      expect(res.body.error.code).toBe("NO_ACTIVE_ORG");
    },
  );

  it("создание организации и switch-org выводят аккаунт из состояния «без организации»", async () => {
    const { accessToken } = await registerWithoutOrg();

    const created = await request(app.getHttpServer())
      .post("/v1/organizations")
      .set(...bearer(accessToken))
      .send({ name: "Reborn" })
      .expect(201);
    const orgId = created.body.data.orgId as string;

    const switched = await request(app.getHttpServer())
      .post("/v1/auth/switch-org")
      .set(...bearer(accessToken))
      .send({ orgId })
      .expect(200);

    expect(claimsOf(switched.body.data.accessToken).activeOrgId).toBe(orgId);
    await request(app.getHttpServer())
      .get("/v1/organizations/members")
      .set(...bearer(switched.body.data.accessToken as string))
      .expect(200);
  });

  it("switch-org в чужую организацию по-прежнему 403 NOT_ORG_MEMBER", async () => {
    const { accessToken } = await registerWithoutOrg();
    const stranger = await prisma.organization.create({ data: { name: "Stranger" } });

    const res = await request(app.getHttpServer())
      .post("/v1/auth/switch-org")
      .set(...bearer(accessToken))
      .send({ orgId: stranger.id })
      .expect(403);

    expect(res.body.error.code).toBe("NOT_ORG_MEMBER");
  });

  it("logout-all работает без организации", async () => {
    const { accessToken } = await registerWithoutOrg();

    await request(app.getHttpServer())
      .post("/v1/auth/logout-all")
      .set(...bearer(accessToken))
      .expect(200);
  });

  it("исключённого участника следующий refresh переводит в состояние без организации", async () => {
    const owner = await request(app.getHttpServer())
      .post("/v1/auth/register")
      .send({ email: `kick-owner${counter++}@example.com`, name: "Owner", password: PASSWORD })
      .expect(201);
    const ownerToken = owner.body.data.accessToken as string;
    const orgId = claimsOf(ownerToken).activeOrgId as string;

    const invitee = await registerWithoutOrg();
    await prisma.membership.create({ data: { orgId, userId: invitee.userId, role: "MEMBER" } });
    const login = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .send({ email: invitee.email, password: PASSWORD })
      .expect(200);
    expect(claimsOf(login.body.data.accessToken).activeOrgId).toBe(orgId);

    await request(app.getHttpServer())
      .delete(`/v1/organizations/members/${invitee.userId}`)
      .set(...bearer(ownerToken))
      .expect(200);

    const refreshed = await request(app.getHttpServer())
      .post("/v1/auth/refresh")
      .set("Cookie", cookieFrom(login))
      .expect(200);
    expect(claimsOf(refreshed.body.data.accessToken).activeOrgId).toBeNull();
  });
});
