import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@helix/db";
import { createTestApp } from "../helpers/create-test-app";

describe("GET /v1/organizations/members", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const register = async (email: string, name: string): Promise<{ token: string; userId: string }> => {
    const res = await request(app.getHttpServer())
      .post("/v1/auth/register")
      .send({ email, name, password: "correct horse battery staple" })
      .expect(201);
    return { token: res.body.data.accessToken as string, userId: res.body.data.user.id as string };
  };

  it("возвращает единственного участника свежей орги (себя)", async () => {
    const { token, userId } = await register("solo@example.com", "Solo Owner");

    const res = await request(app.getHttpServer())
      .get("/v1/organizations/members")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body.data).toEqual([
      { userId, name: "Solo Owner", email: "solo@example.com", role: "OWNER" },
    ]);
  });

  it("tenant-скоуп: НЕ видит участников чужой орги", async () => {
    const orgA = await register("a-owner@example.com", "A Owner");
    const orgB = await register("b-owner@example.com", "B Owner");

    // Добавляем второго участника ТОЛЬКО в оргу A — минуя API (инвайтов ещё нет, §8.3).
    const orgAId = (
      await prisma.membership.findFirstOrThrow({ where: { userId: orgA.userId } })
    ).orgId;
    const orgBId = (
      await prisma.membership.findFirstOrThrow({ where: { userId: orgB.userId } })
    ).orgId;
    const secondUser = await prisma.user.create({
      data: { email: "a-member@example.com", name: "A Member", passwordHash: null },
    });
    await prisma.membership.create({ data: { orgId: orgAId, userId: secondUser.id, role: "MEMBER" } });

    const resA = await request(app.getHttpServer())
      .get("/v1/organizations/members")
      .set("Authorization", `Bearer ${orgA.token}`)
      .expect(200);
    expect(resA.body.data).toHaveLength(2);
    expect(resA.body.data.map((m: { email: string }) => m.email).sort()).toEqual([
      "a-member@example.com",
      "a-owner@example.com",
    ]);

    const resB = await request(app.getHttpServer())
      .get("/v1/organizations/members")
      .set("Authorization", `Bearer ${orgB.token}`)
      .expect(200);
    expect(resB.body.data).toEqual([
      { userId: orgB.userId, name: "B Owner", email: "b-owner@example.com", role: "OWNER" },
    ]);
    expect(orgAId).not.toBe(orgBId);
  });

  it("без токена → 401", async () => {
    await request(app.getHttpServer()).get("/v1/organizations/members").expect(401);
  });
});
