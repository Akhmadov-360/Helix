import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@helix/db";
import { createTestApp } from "../helpers/create-test-app";

const VALID = {
  email: "founder@example.com",
  name: "Aza Founder",
  password: "correct horse battery staple",
};

describe("POST /v1/auth/register", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("создаёт пользователя и отдаёт профиль в конверте", async () => {
    const res = await request(app.getHttpServer()).post("/v1/auth/register").send(VALID).expect(201);

    expect(res.body).toMatchObject({
      success: true,
      data: { user: { email: VALID.email, name: VALID.name } },
    });
    expect(typeof res.body.data.user.id).toBe("string");
    expect(typeof res.body.data.accessToken).toBe("string");
  });

  it("НЕ отдаёт passwordHash наружу", async () => {
    const res = await request(app.getHttpServer()).post("/v1/auth/register").send(VALID).expect(201);

    expect(res.body.data.user).not.toHaveProperty("passwordHash");
    expect(JSON.stringify(res.body)).not.toContain(VALID.password);
  });

  it("в БД лежит argon2-хеш, а не открытый пароль", async () => {
    await request(app.getHttpServer()).post("/v1/auth/register").send(VALID).expect(201);

    const user = await prisma.user.findUnique({ where: { email: VALID.email } });
    expect(user?.passwordHash).toBeTruthy();
    expect(user?.passwordHash).not.toBe(VALID.password);
    expect(user?.passwordHash?.startsWith("$argon2id$")).toBe(true);
  });

  it("создаёт личную организацию и делает юзера её OWNER", async () => {
    const res = await request(app.getHttpServer()).post("/v1/auth/register").send(VALID).expect(201);
    const userId = res.body.data.user.id as string;

    // Инвариант §9.1: не бывает User без Membership — сирот-без-орги не существует.
    const memberships = await prisma.membership.findMany({
      where: { userId },
      include: { org: true },
    });

    expect(memberships).toHaveLength(1);
    expect(memberships[0]?.role).toBe("OWNER");
    expect(memberships[0]?.org.name).toBe(VALID.name);
  });

  it("занятый email не оставляет осиротевшую организацию (транзакция откатывается)", async () => {
    await request(app.getHttpServer()).post("/v1/auth/register").send(VALID).expect(201);
    expect(await prisma.organization.count()).toBe(1);

    await request(app.getHttpServer()).post("/v1/auth/register").send(VALID).expect(409);

    // Если бы три записи создавались вне транзакции, второй заход оставил бы
    // лишнюю оргу без владельца. Тест краснеет, если кто-то уберёт $transaction.
    expect(await prisma.organization.count()).toBe(1);
    expect(await prisma.membership.count()).toBe(1);
  });

  it("занятый email отдаёт 409 в error-конверте", async () => {
    await request(app.getHttpServer()).post("/v1/auth/register").send(VALID).expect(201);

    const res = await request(app.getHttpServer()).post("/v1/auth/register").send(VALID).expect(409);

    expect(res.body).toMatchObject({
      success: false,
      error: { code: "UNIQUE_VIOLATION" },
    });
  });

  it("email нормализуется — регистр и пробелы не создают второй аккаунт", async () => {
    await request(app.getHttpServer()).post("/v1/auth/register").send(VALID).expect(201);

    await request(app.getHttpServer())
      .post("/v1/auth/register")
      .send({ ...VALID, email: "  FOUNDER@Example.COM  " })
      .expect(409);

    expect(await prisma.user.count()).toBe(1);
  });

  describe("валидация входа", () => {
    it("отвергает короткий пароль", async () => {
      const res = await request(app.getHttpServer())
        .post("/v1/auth/register")
        .send({ ...VALID, password: "short" })
        .expect(400);

      expect(res.body).toMatchObject({
        success: false,
        error: { code: "VALIDATION_ERROR" },
      });
      expect(res.body.error.details).toHaveProperty("password");
    });

    it("отвергает кривой email", async () => {
      await request(app.getHttpServer())
        .post("/v1/auth/register")
        .send({ ...VALID, email: "not-an-email" })
        .expect(400);
    });

    it("отвергает пустое имя", async () => {
      await request(app.getHttpServer())
        .post("/v1/auth/register")
        .send({ ...VALID, name: "   " })
        .expect(400);
    });
  });
});
