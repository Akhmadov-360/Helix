import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@helix/db";
import { REFRESH_COOKIE_NAME, REFRESH_COOKIE_PATH } from "../../src/modules/auth/sessions/refresh-cookie.service";
import { hashRefreshToken } from "../../src/modules/auth/sessions/refresh-token";
import { createTestApp } from "../helpers/create-test-app";

const REGISTRATION = {
  email: "member@example.com",
  name: "Test Member",
  password: "correct horse battery staple",
};

const CREDENTIALS = { email: REGISTRATION.email, password: REGISTRATION.password };

/** Достаёт значение refresh-cookie из заголовков ответа. */
function refreshCookieFrom(res: request.Response): string {
  const raw = res.headers["set-cookie"] as unknown as string[] | undefined;
  const cookie = raw?.find((c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`));
  if (!cookie) throw new Error("refresh cookie not set");
  return cookie;
}

function cookieValue(cookie: string): string {
  return decodeURIComponent(cookie.split(";")[0]?.split("=")[1] ?? "");
}

describe("RefreshSession (создание на входе)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const register = () => request(app.getHttpServer()).post("/v1/auth/register").send(REGISTRATION);
  const login = () => request(app.getHttpServer()).post("/v1/auth/login").send(CREDENTIALS);

  describe("cookie", () => {
    it("регистрация ставит refresh-cookie", async () => {
      const res = await register().expect(201);
      expect(refreshCookieFrom(res)).toBeTruthy();
    });

    it("логин ставит refresh-cookie", async () => {
      await register().expect(201);
      const res = await login().expect(200);
      expect(refreshCookieFrom(res)).toBeTruthy();
    });

    it("cookie httpOnly, SameSite=Lax и ограничена путём /v1/auth", async () => {
      const cookie = refreshCookieFrom(await register().expect(201));

      // httpOnly — против XSS (JS не прочитает), SameSite — против CSRF. Разные угрозы.
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Lax/i);
      expect(cookie).toContain(`Path=${REFRESH_COOKIE_PATH}`);
    });

    it("в тестовом (не production) окружении Secure не ставится", async () => {
      // Иначе по http://localhost браузер cookie просто не сохранил бы.
      expect(refreshCookieFrom(await register().expect(201))).not.toMatch(/Secure/i);
    });

    it("срок жизни cookie совпадает с TTL сессии", async () => {
      const cookie = refreshCookieFrom(await register().expect(201));
      const maxAge = Number(/Max-Age=(\d+)/i.exec(cookie)?.[1]);

      expect(maxAge).toBe(30 * 24 * 60 * 60); // REFRESH_TTL_DAYS по умолчанию
    });
  });

  describe("что легло в БД", () => {
    it("создаётся ровно одна сессия, привязанная к пользователю", async () => {
      const res = await register().expect(201);
      const userId = res.body.data.user.id as string;

      const sessions = await prisma.refreshSession.findMany();
      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.userId).toBe(userId);
    });

    it("в БД лежит SHA-256 токена, а НЕ сам токен", async () => {
      const res = await register().expect(201);
      const rawToken = cookieValue(refreshCookieFrom(res));

      const session = await prisma.refreshSession.findFirst();

      expect(session?.tokenHash).not.toBe(rawToken);
      expect(session?.tokenHash).toBe(hashRefreshToken(rawToken));
    });

    it("сырой токен не попадает в тело ответа", async () => {
      const res = await register().expect(201);
      const rawToken = cookieValue(refreshCookieFrom(res));

      // Refresh живёт только в httpOnly-cookie (§4) — в body его быть не должно.
      expect(JSON.stringify(res.body)).not.toContain(rawToken);
      expect(res.body.data).not.toHaveProperty("refreshToken");
    });

    it("сессия свежая: не потрачена и не отозвана", async () => {
      await register().expect(201);
      const session = await prisma.refreshSession.findFirst();

      expect(session?.usedAt).toBeNull();
      expect(session?.revokedAt).toBeNull();
      expect(session?.revokedReason).toBeNull();
    });

    it("lastActiveOrgId совпадает с оргой из access-токена", async () => {
      const res = await register().expect(201);
      const claims = JSON.parse(
        Buffer.from((res.body.data.accessToken as string).split(".")[1] ?? "", "base64url").toString(
          "utf8",
        ),
      ) as { activeOrgId: string };

      const session = await prisma.refreshSession.findFirst();
      expect(session?.lastActiveOrgId).toBe(claims.activeOrgId);
    });

    it("expiresAt — абсолютный TTL от создания (~30 дней)", async () => {
      await register().expect(201);
      const session = await prisma.refreshSession.findFirst();

      const ttlMs = (session?.expiresAt.getTime() ?? 0) - (session?.createdAt.getTime() ?? 0);
      const days = ttlMs / (24 * 60 * 60 * 1000);

      expect(days).toBeGreaterThan(29.9);
      expect(days).toBeLessThan(30.1);
    });

    it("сохраняется user-agent для будущего экрана сессий", async () => {
      await request(app.getHttpServer())
        .post("/v1/auth/register")
        .set("User-Agent", "HelixTestBrowser/1.0")
        .send(REGISTRATION)
        .expect(201);

      const session = await prisma.refreshSession.findFirst();
      expect(session?.userAgent).toBe("HelixTestBrowser/1.0");
    });
  });

  describe("familyId", () => {
    it("каждый вход заводит НОВУЮ цепочку", async () => {
      await register().expect(201);
      await login().expect(200);
      await login().expect(200);

      const sessions = await prisma.refreshSession.findMany();
      const families = new Set(sessions.map((s) => s.familyId));

      // Три входа = три независимые цепочки: reuse-detection на одной (шаг 7)
      // не должна выкидывать пользователя с других устройств.
      expect(sessions).toHaveLength(3);
      expect(families.size).toBe(3);
    });
  });

  describe("неудачная регистрация", () => {
    /**
     * ЧЕСТНАЯ ОЦЕНКА СИЛЫ ТЕСТА: это проверка конечного состояния, а НЕ доказательство
     * атомарности. RefreshSession требует userId, поэтому создаётся после User.create —
     * а тот на дубле email падает раньше, до сессии дело не доходит. Тест остался бы
     * зелёным и без транзакции.
     *
     * Реальную атомарность регистрации охраняет тест в register.spec.ts («занятый email
     * не оставляет осиротевшую организацию»): там орга создаётся ДО падения, поэтому
     * без $transaction она бы осталась — проверено диверсией.
     */
    it("после отказа в БД не остаётся лишних сессий", async () => {
      await register().expect(201);
      expect(await prisma.refreshSession.count()).toBe(1);

      await register().expect(409);

      expect(await prisma.refreshSession.count()).toBe(1);
    });
  });
});
