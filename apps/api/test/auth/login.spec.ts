import type { INestApplication } from "@nestjs/common";
import { hash as argon2Hash } from "@node-rs/argon2";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@helix/db";
import { ARGON2_POLICY } from "../../src/modules/auth/password.service";
import { createTestApp } from "../helpers/create-test-app";

const CREDENTIALS = {
  email: "member@example.com",
  password: "correct horse battery staple",
};

const REGISTRATION = { ...CREDENTIALS, name: "Test Member" };

describe("POST /v1/auth/login", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const registerUser = async (): Promise<void> => {
    await request(app.getHttpServer()).post("/v1/auth/register").send(REGISTRATION).expect(201);
  };

  it("пускает с верными данными и отдаёт профиль", async () => {
    await registerUser();

    const res = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .send(CREDENTIALS)
      .expect(200);

    expect(res.body).toMatchObject({
      success: true,
      data: { user: { email: CREDENTIALS.email, name: REGISTRATION.name } },
    });
    expect(res.body.data.user).not.toHaveProperty("passwordHash");
  });

  it("логин работает с email в другом регистре (нормализация)", async () => {
    await registerUser();

    await request(app.getHttpServer())
      .post("/v1/auth/login")
      .send({ ...CREDENTIALS, email: "  MEMBER@Example.COM  " })
      .expect(200);
  });

  it("отвергает неверный пароль", async () => {
    await registerUser();

    await request(app.getHttpServer())
      .post("/v1/auth/login")
      .send({ ...CREDENTIALS, password: "definitely not the password" })
      .expect(401);
  });

  it("неизвестный email и неверный пароль неотличимы (нет user enumeration)", async () => {
    await registerUser();

    const unknownEmail = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .send({ email: "nobody@example.com", password: CREDENTIALS.password })
      .expect(401);

    const wrongPassword = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .send({ ...CREDENTIALS, password: "wrong password value" })
      .expect(401);

    // Ответ не должен подсказывать, существует ли аккаунт.
    expect(unknownEmail.body.error).toEqual(wrongPassword.body.error);
  });

  describe("progressive rehash", () => {
    /** Хеш по устаревшим (слабым) параметрам — как будто OWASP с тех пор поднял пороги. */
    const makeOutdatedHash = async (password: string): Promise<string> =>
      argon2Hash(password, {
        algorithm: ARGON2_POLICY.algorithm,
        memoryCost: 8192, // ниже текущей политики (19456)
        timeCost: 1, // ниже текущей политики (2)
        parallelism: 1,
      });

    it("пересчитывает устаревший хеш при успешном логине", async () => {
      await registerUser();

      // Подменяем хеш на устаревший, будто он лежал в БД с прошлых лет.
      const outdated = await makeOutdatedHash(CREDENTIALS.password);
      await prisma.user.update({
        where: { email: CREDENTIALS.email },
        data: { passwordHash: outdated },
      });

      await request(app.getHttpServer()).post("/v1/auth/login").send(CREDENTIALS).expect(200);

      const after = await prisma.user.findUnique({ where: { email: CREDENTIALS.email } });
      expect(after?.passwordHash).not.toBe(outdated);
      expect(after?.passwordHash).toContain(`m=${ARGON2_POLICY.memoryCost}`);
      expect(after?.passwordHash).toContain(`t=${ARGON2_POLICY.timeCost}`);
    });

    it("после пересчёта логин тем же паролем продолжает работать", async () => {
      await registerUser();

      await prisma.user.update({
        where: { email: CREDENTIALS.email },
        data: { passwordHash: await makeOutdatedHash(CREDENTIALS.password) },
      });

      // Первый логин апгрейдит хеш, второй проверяет его пригодность.
      await request(app.getHttpServer()).post("/v1/auth/login").send(CREDENTIALS).expect(200);
      await request(app.getHttpServer()).post("/v1/auth/login").send(CREDENTIALS).expect(200);
    });

    it("не трогает хеш, если параметры актуальны", async () => {
      await registerUser();

      const before = await prisma.user.findUnique({ where: { email: CREDENTIALS.email } });
      await request(app.getHttpServer()).post("/v1/auth/login").send(CREDENTIALS).expect(200);
      const after = await prisma.user.findUnique({ where: { email: CREDENTIALS.email } });

      expect(after?.passwordHash).toBe(before?.passwordHash);
    });
  });

  describe("валидация входа", () => {
    it("отвергает кривой email", async () => {
      await request(app.getHttpServer())
        .post("/v1/auth/login")
        .send({ email: "not-an-email", password: "whatever value" })
        .expect(400);
    });

    it("принимает короткий пароль на ВХОД (политика длины — только при задании)", async () => {
      // Не 400: короткий пароль должен дойти до проверки и получить честный 401,
      // иначе форма логина выдавала бы политику паролей.
      await request(app.getHttpServer())
        .post("/v1/auth/login")
        .send({ email: CREDENTIALS.email, password: "short" })
        .expect(401);
    });
  });
});
