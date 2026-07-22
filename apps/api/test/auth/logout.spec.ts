import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@helix/db";
import { REFRESH_COOKIE_NAME } from "../../src/modules/auth/sessions/refresh-cookie.service";
import { createTestApp } from "../helpers/create-test-app";

const REGISTRATION = {
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

/** Полная строка Set-Cookie (с атрибутами) — нужна для проверки очистки. */
function setCookieHeader(res: request.Response): string {
  const raw = res.headers["set-cookie"] as unknown as string[] | undefined;
  return raw?.find((c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`)) ?? "";
}

describe("POST /v1/auth/logout", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const signUp = async (): Promise<{ cookie: string; accessToken: string }> => {
    const res = await request(app.getHttpServer())
      .post("/v1/auth/register")
      .send(REGISTRATION)
      .expect(201);
    return { cookie: cookieFrom(res), accessToken: res.body.data.accessToken as string };
  };

  const logout = (cookie?: string) => {
    const req = request(app.getHttpServer()).post("/v1/auth/logout");
    return cookie ? req.set("Cookie", cookie) : req;
  };

  it("отзывает сессию с причиной LOGOUT", async () => {
    const { cookie } = await signUp();

    await logout(cookie).expect(200);

    const session = await prisma.refreshSession.findFirst();
    expect(session?.revokedAt).toBeInstanceOf(Date);
    expect(session?.revokedReason).toBe("LOGOUT");
  });

  it("отдаёт конверт с data: null", async () => {
    const { cookie } = await signUp();
    const res = await logout(cookie).expect(200);

    expect(res.body).toMatchObject({ success: true, data: null });
    expect(typeof res.body.timestamp).toBe("string");
  });

  it("после logout refresh больше не работает — ЭТО и есть выход", async () => {
    const { cookie } = await signUp();
    await logout(cookie).expect(200);

    await request(app.getHttpServer())
      .post("/v1/auth/refresh")
      .set("Cookie", cookie)
      .expect(401);
  });

  it("чистит cookie у клиента", async () => {
    const { cookie } = await signUp();
    const header = setCookieHeader(await logout(cookie).expect(200));

    // Express обнуляет значение и ставит прошедшую дату.
    expect(header).toMatch(new RegExp(`^${REFRESH_COOKIE_NAME}=;`));
    expect(header).toMatch(/Expires=Thu, 01 Jan 1970/i);
    // Path обязан совпасть с тем, что был при установке, иначе браузер
    // счёл бы это другой cookie и старую не удалил.
    expect(header).toContain("Path=/v1/auth");
  });

  describe("идемпотентность", () => {
    it("без cookie — успех, а не ошибка", async () => {
      await logout().expect(200);
    });

    it("с несуществующим токеном — успех", async () => {
      await logout(`${REFRESH_COOKIE_NAME}=never-existed`).expect(200);
    });

    it("повторный logout не перетирает исходную причину и время", async () => {
      const { cookie } = await signUp();

      await logout(cookie).expect(200);
      const first = await prisma.refreshSession.findFirst();

      await logout(cookie).expect(200);
      const second = await prisma.refreshSession.findFirst();

      expect(second?.revokedAt?.getTime()).toBe(first?.revokedAt?.getTime());
      expect(second?.revokedReason).toBe("LOGOUT");
    });
  });

  describe("границы действия", () => {
    it("access-токен ПРОДОЛЖАЕТ работать до своего exp", async () => {
      const { cookie, accessToken } = await signUp();
      await logout(cookie).expect(200);

      // Это НЕ баг, а следствие stateless-access: «удалить JWT на сервере» нельзя,
      // он доживёт до exp (≤15 мин) и протухнет сам. Именно поэтому TTL короткий.
      // Тест фиксирует осознанную границу — чтобы её не «чинили» по недоразумению.
      await request(app.getHttpServer())
        .get("/v1/auth/me")
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);
    });

    it("не трогает сессии на других устройствах", async () => {
      const { cookie: deviceA } = await signUp();
      const deviceB = cookieFrom(
        await request(app.getHttpServer())
          .post("/v1/auth/login")
          .send({ email: REGISTRATION.email, password: REGISTRATION.password })
          .expect(200),
      );

      await logout(deviceA).expect(200);

      // Выход на одном устройстве не выкидывает с остальных — для этого есть
      // logout-all (шаг 9).
      await request(app.getHttpServer())
        .post("/v1/auth/refresh")
        .set("Cookie", deviceB)
        .expect(200);
    });

    it("logout после ротации отзывает ТЕКУЩИЙ токен цепочки", async () => {
      const { cookie } = await signUp();
      const rotated = cookieFrom(
        await request(app.getHttpServer())
          .post("/v1/auth/refresh")
          .set("Cookie", cookie)
          .expect(200),
      );

      await logout(rotated).expect(200);

      const live = await prisma.refreshSession.findFirst({ where: { usedAt: null } });
      expect(live?.revokedAt).toBeInstanceOf(Date);
      expect(live?.revokedReason).toBe("LOGOUT");
    });
  });
});
