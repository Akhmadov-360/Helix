import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@helix/db";
import { createTestApp } from "../helpers/create-test-app";

const REGISTRATION = {
  email: "member@example.com",
  name: "Test Member",
  password: "correct horse battery staple",
};

/** Тот же секрет, что в .env.test — нужен, чтобы подделать «чужие» токены. */
const SECRET = "test-only-secret-not-for-production-0123456789";

describe("GET /v1/auth/me (JwtAuthGuard)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const registerAndGetToken = async (): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post("/v1/auth/register")
      .send(REGISTRATION)
      .expect(201);
    return res.body.data.accessToken as string;
  };

  it("с валидным токеном отдаёт профиль из БД", async () => {
    const token = await registerAndGetToken();

    const res = await request(app.getHttpServer())
      .get("/v1/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body).toMatchObject({
      success: true,
      data: { email: REGISTRATION.email, name: REGISTRATION.name },
    });
    expect(res.body.data).not.toHaveProperty("passwordHash");
  });

  it("токен, выданный логином, тоже работает", async () => {
    await registerAndGetToken();

    const login = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .send({ email: REGISTRATION.email, password: REGISTRATION.password })
      .expect(200);

    await request(app.getHttpServer())
      .get("/v1/auth/me")
      .set("Authorization", `Bearer ${login.body.data.accessToken}`)
      .expect(200);
  });

  it("возвращает СВЕЖЕЕ имя из БД, а не из токена", async () => {
    const token = await registerAndGetToken();

    await prisma.user.update({
      where: { email: REGISTRATION.email },
      data: { name: "Renamed After Token" },
    });

    const res = await request(app.getHttpServer())
      .get("/v1/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    // Если бы профиль ехал в токене, здесь осталось бы старое имя.
    expect(res.body.data.name).toBe("Renamed After Token");
  });

  describe("отказы", () => {
    it("без заголовка Authorization → 401 INVALID_TOKEN", async () => {
      const res = await request(app.getHttpServer()).get("/v1/auth/me").expect(401);

      expect(res.body).toMatchObject({
        success: false,
        error: { code: "INVALID_TOKEN" },
      });
    });

    it("со схемой не Bearer → 401", async () => {
      await request(app.getHttpServer())
        .get("/v1/auth/me")
        .set("Authorization", "Basic dXNlcjpwYXNz")
        .expect(401);
    });

    it("с мусором вместо токена → 401", async () => {
      await request(app.getHttpServer())
        .get("/v1/auth/me")
        .set("Authorization", "Bearer not.a.real.token")
        .expect(401);
    });

    it("с истёкшим токеном → 401", async () => {
      const token = await registerAndGetToken();
      const user = await prisma.user.findUnique({ where: { email: REGISTRATION.email } });

      const expired = await new JwtService({ secret: SECRET }).signAsync(
        { sub: user?.id, activeOrgId: "whatever", jti: "expired" },
        { expiresIn: "-1s" },
      );

      expect(token).not.toBe(expired);
      await request(app.getHttpServer())
        .get("/v1/auth/me")
        .set("Authorization", `Bearer ${expired}`)
        .expect(401);
    });

    it("с токеном, подписанным чужим секретом → 401", async () => {
      const forged = await new JwtService({ secret: "attacker-secret-0123456789abcdef" }).signAsync(
        { sub: "any", activeOrgId: "any", jti: "forged" },
        { expiresIn: "15m" },
      );

      await request(app.getHttpServer())
        .get("/v1/auth/me")
        .set("Authorization", `Bearer ${forged}`)
        .expect(401);
    });

    it("подпись валидна, но юзера удалили → 403 (членство ушло каскадом)", async () => {
      const token = await registerAndGetToken();
      await prisma.user.deleteMany({});

      // Не 401: удаление User каскадом сносит Membership, и guard отказывает на
      // проверке членства раньше, чем контроллер обнаружит отсутствие юзера.
      // Отличать эти случаи значило бы читать User в guard'е на КАЖДОМ запросе
      // ради сценария «юзера удалили прямо сейчас» — цена не стоит различия,
      // доступ закрыт в обоих случаях.
      await request(app.getHttpServer())
        .get("/v1/auth/me")
        .set("Authorization", `Bearer ${token}`)
        .expect(403);
    });
  });
});
