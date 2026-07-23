import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, type Role } from "@helix/db";
import { createTestApp } from "../helpers/create-test-app";

let counter = 0;

/** Регистрирует юзера (OWNER личной орги) и при необходимости меняет его роль. */
async function signUpAs(app: INestApplication, role: Role): Promise<string> {
  const email = `authz${counter++}@example.com`;
  const res = await request(app.getHttpServer())
    .post("/v1/auth/register")
    .send({ email, name: "User", password: "correct horse battery staple" })
    .expect(201);

  const token = res.body.data.accessToken as string;
  if (role !== "OWNER") {
    // Роль читается guard'ом из Membership на каждом запросе — тот же токен увидит новую.
    await prisma.membership.updateMany({ where: { user: { email } }, data: { role } });
  }
  return token;
}

describe("Workspaces authz (CASL по org-роли)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const createWs = (token: string) =>
    request(app.getHttpServer())
      .post("/v1/workspaces")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Board" });

  describe("POST /v1/workspaces — только O/A/M", () => {
    it.each<Role>(["OWNER", "ADMIN", "MANAGER"])("%s может создавать (201)", async (role) => {
      const token = await signUpAs(app, role);
      await createWs(token).expect(201);
    });

    it.each<Role>(["MEMBER", "VIEWER"])("%s получает 403 FORBIDDEN", async (role) => {
      const token = await signUpAs(app, role);
      const res = await createWs(token).expect(403);
      expect(res.body).toMatchObject({ success: false, error: { code: "FORBIDDEN" } });
    });

    it("403 приходит от роли, а не от членства — юзер В орге, просто MEMBER", async () => {
      const token = await signUpAs(app, "MEMBER");
      const res = await createWs(token).expect(403);
      // NOT_ORG_MEMBER означал бы, что членство потеряно; тут именно ролевой отказ.
      expect(res.body.error.code).toBe("FORBIDDEN");
      expect(res.body.error.code).not.toBe("NOT_ORG_MEMBER");
    });
  });

  describe("чтение доступно всем ролям", () => {
    it.each<Role>(["OWNER", "ADMIN", "MANAGER", "MEMBER", "VIEWER"])(
      "%s может читать список (200)",
      async (role) => {
        const token = await signUpAs(app, role);
        await request(app.getHttpServer())
          .get("/v1/workspaces")
          .set("Authorization", `Bearer ${token}`)
          .expect(200);
      },
    );

    it("MEMBER, лишённый create, всё равно видит свои доски", async () => {
      const owner = await signUpAs(app, "OWNER");
      await createWs(owner).expect(201);

      // Тот же юзер, но теперь понижен до MEMBER — читать может, создавать нет.
      await prisma.membership.updateMany({ data: { role: "MEMBER" } });
      await request(app.getHttpServer())
        .get("/v1/workspaces")
        .set("Authorization", `Bearer ${owner}`)
        .expect(200);
      await createWs(owner).expect(403);
    });
  });
});
