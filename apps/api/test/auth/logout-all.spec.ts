import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@helix/db";
import { REFRESH_COOKIE_NAME } from "../../src/auth/refresh-cookie.service";
import { createTestApp } from "../helpers/create-test-app";

const OWNER = {
  email: "owner@example.com",
  name: "Session Owner",
  password: "correct horse battery staple",
};

const STRANGER = {
  email: "stranger@example.com",
  name: "Other Person",
  password: "entirely different passphrase",
};

function cookieFrom(res: request.Response): string {
  const raw = res.headers["set-cookie"] as unknown as string[] | undefined;
  const cookie = raw?.find((c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`));
  if (!cookie) throw new Error("refresh cookie not set");
  return cookie.split(";")[0] ?? "";
}

function setCookieHeader(res: request.Response): string {
  const raw = res.headers["set-cookie"] as unknown as string[] | undefined;
  return raw?.find((c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`)) ?? "";
}

describe("POST /v1/auth/logout-all", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  interface Session {
    cookie: string;
    accessToken: string;
  }

  const register = async (who: typeof OWNER): Promise<Session> => {
    const res = await request(app.getHttpServer())
      .post("/v1/auth/register")
      .send(who)
      .expect(201);
    return { cookie: cookieFrom(res), accessToken: res.body.data.accessToken as string };
  };

  const login = async (who: typeof OWNER): Promise<Session> => {
    const res = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .send({ email: who.email, password: who.password })
      .expect(200);
    return { cookie: cookieFrom(res), accessToken: res.body.data.accessToken as string };
  };

  const logoutAll = (accessToken?: string) => {
    const req = request(app.getHttpServer()).post("/v1/auth/logout-all");
    return accessToken ? req.set("Authorization", `Bearer ${accessToken}`) : req;
  };

  const refreshWith = (cookie: string) =>
    request(app.getHttpServer()).post("/v1/auth/refresh").set("Cookie", cookie);

  it("отзывает сессии на ВСЕХ устройствах, а не только текущее", async () => {
    const deviceA = await register(OWNER);
    const deviceB = await login(OWNER);
    const deviceC = await login(OWNER);

    expect(await prisma.refreshSession.count({ where: { revokedAt: null } })).toBe(3);

    await logoutAll(deviceA.accessToken).expect(200);

    expect(await prisma.refreshSession.count({ where: { revokedAt: null } })).toBe(0);
    await refreshWith(deviceA.cookie).expect(401);
    await refreshWith(deviceB.cookie).expect(401);
    await refreshWith(deviceC.cookie).expect(401);
  });

  it("захватывает разные цепочки (у каждого входа свой familyId)", async () => {
    const deviceA = await register(OWNER);
    await login(OWNER);

    const families = new Set((await prisma.refreshSession.findMany()).map((s) => s.familyId));
    expect(families.size).toBe(2);

    await logoutAll(deviceA.accessToken).expect(200);

    const sessions = await prisma.refreshSession.findMany();
    for (const session of sessions) {
      expect(session.revokedAt).toBeInstanceOf(Date);
      expect(session.revokedReason).toBe("LOGOUT");
    }
  });

  it("отзывает и уже ротированные строки цепочки", async () => {
    const device = await register(OWNER);
    await refreshWith(device.cookie).expect(200); // старая строка стала usedAt

    await logoutAll(device.accessToken).expect(200);

    // Потраченные строки и так мертвы, но после явного «выйти везде» в журнале
    // не должно оставаться записей «не отозвана».
    expect(await prisma.refreshSession.count({ where: { revokedAt: null } })).toBe(0);
  });

  it("НЕ трогает сессии других пользователей", async () => {
    const owner = await register(OWNER);
    const stranger = await register(STRANGER);

    await logoutAll(owner.accessToken).expect(200);

    // Ошибка в условии WHERE разлогинила бы весь сервис — этот тест её ловит.
    const strangerSessions = await prisma.refreshSession.findMany({
      where: { user: { email: STRANGER.email } },
    });
    expect(strangerSessions).toHaveLength(1);
    expect(strangerSessions[0]?.revokedAt).toBeNull();

    await refreshWith(stranger.cookie).expect(200);
  });

  it("чистит cookie текущего клиента", async () => {
    const device = await register(OWNER);
    const header = setCookieHeader(await logoutAll(device.accessToken).expect(200));

    expect(header).toMatch(new RegExp(`^${REFRESH_COOKIE_NAME}=;`));
    expect(header).toContain("Path=/v1/auth");
  });

  it("отдаёт конверт с data: null", async () => {
    const device = await register(OWNER);
    const res = await logoutAll(device.accessToken).expect(200);

    expect(res.body).toMatchObject({ success: true, data: null });
  });

  it("повторный вызов безопасен", async () => {
    const device = await register(OWNER);

    await logoutAll(device.accessToken).expect(200);
    const first = await prisma.refreshSession.findFirst();

    // access ещё жив (stateless), поэтому второй вызов проходит guard.
    await logoutAll(device.accessToken).expect(200);
    const second = await prisma.refreshSession.findFirst();

    expect(second?.revokedAt?.getTime()).toBe(first?.revokedAt?.getTime());
  });

  describe("требует аутентификации", () => {
    it("без токена → 401", async () => {
      await register(OWNER);
      const res = await logoutAll().expect(401);

      expect(res.body).toMatchObject({
        success: false,
        error: { code: "INVALID_TOKEN" },
      });
    });

    it("с мусорным токеном → 401 и сессии целы", async () => {
      const device = await register(OWNER);

      await logoutAll("not.a.real.token").expect(401);

      expect(await prisma.refreshSession.count({ where: { revokedAt: null } })).toBe(1);
      await refreshWith(device.cookie).expect(200);
    });
  });
});
