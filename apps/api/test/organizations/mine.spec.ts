import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@helix/db";
import { createTestApp } from "../helpers/create-test-app";

describe("GET /v1/organizations/mine (FR-ORG-2)", () => {
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

  it("свежий юзер видит ровно свою орг с ролью OWNER", async () => {
    const { token, userId } = await register("solo-mine@example.com", "Solo Owner");
    const membership = await prisma.membership.findFirstOrThrow({ where: { userId } });

    const res = await request(app.getHttpServer())
      .get("/v1/organizations/mine")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body.data).toEqual([
      { orgId: membership.orgId, name: "Solo Owner", role: "OWNER" },
    ]);
  });

  it("юзер в двух оргах видит обе, каждую со своей ролью", async () => {
    const { token, userId } = await register("multi-mine@example.com", "Multi User");
    const otherOrg = await prisma.organization.create({ data: { name: "Second Org" } });
    await prisma.membership.create({ data: { orgId: otherOrg.id, userId, role: "MEMBER" } });

    const res = await request(app.getHttpServer())
      .get("/v1/organizations/mine")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body.data).toHaveLength(2);
    const byOrgId = new Map(res.body.data.map((o: { orgId: string; role: string }) => [o.orgId, o.role]));
    const ownOrg = await prisma.membership.findFirstOrThrow({ where: { userId, orgId: { not: otherOrg.id } } });
    expect(byOrgId.get(ownOrg.orgId)).toBe("OWNER");
    expect(byOrgId.get(otherOrg.id)).toBe("MEMBER");
  });

  it("НЕ утекает орги других пользователей", async () => {
    const a = await register("a-mine@example.com", "A User");
    await register("b-mine@example.com", "B User");

    const res = await request(app.getHttpServer())
      .get("/v1/organizations/mine")
      .set("Authorization", `Bearer ${a.token}`)
      .expect(200);

    expect(res.body.data).toHaveLength(1);
  });

  it("без токена → 401", async () => {
    await request(app.getHttpServer()).get("/v1/organizations/mine").expect(401);
  });
});
