import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@helix/db";
import { createTestApp } from "../helpers/create-test-app";

let counter = 0;

async function signUp(app: INestApplication): Promise<{ token: string; orgId: string }> {
  const email = `founder${counter++}@example.com`;
  const res = await request(app.getHttpServer())
    .post("/v1/auth/register")
    .send({ email, name: "Founder", password: "correct horse battery staple" })
    .expect(201);

  const token = res.body.data.accessToken as string;
  const orgId = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString()).activeOrgId;
  return { token, orgId };
}

describe("Workspaces (unit B: create / list / get)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const create = (token: string, body: unknown) =>
    request(app.getHttpServer()).post("/v1/workspaces").set("Authorization", `Bearer ${token}`).send(body);

  describe("POST /v1/workspaces", () => {
    it("создаёт доску с дефолтным набором из 4 фаз (§10 вариант B)", async () => {
      const { token } = await signUp(app);

      const res = await create(token, { name: "Sales" }).expect(201);
      const ws = res.body.data;

      expect(ws.name).toBe("Sales");
      expect(ws.version).toBe(0);
      expect(ws.phases).toHaveLength(4);
      expect(ws.phases.map((p: { key: string }) => p.key)).toEqual([
        "lead",
        "in-progress",
        "won",
        "lost",
      ]);
      expect(ws.phases.map((p: { order: number }) => p.order)).toEqual([1, 2, 3, 4]);
    });

    it("среди дефолтных фаз есть WON и LOST (иначе status никогда не станет WON)", async () => {
      const { token } = await signUp(app);
      const res = await create(token, { name: "Board" }).expect(201);

      const types = res.body.data.phases.map((p: { type: string }) => p.type);
      expect(types).toContain("WON");
      expect(types).toContain("LOST");
    });

    it("создаётся в орге вызывающего; orgId из тела игнорируется", async () => {
      const { token, orgId } = await signUp(app);
      const stranger = await signUp(app);

      const res = await create(token, { name: "Mine", orgId: stranger.orgId }).expect(201);

      const row = await prisma.workspace.findUnique({ where: { id: res.body.data.id } });
      expect(row?.orgId).toBe(orgId);
      expect(row?.orgId).not.toBe(stranger.orgId);
    });

    it("фазы физически привязаны к созданной доске", async () => {
      const { token } = await signUp(app);
      const res = await create(token, { name: "WS" }).expect(201);

      const count = await prisma.phase.count({ where: { workspaceId: res.body.data.id } });
      expect(count).toBe(4);
    });

    it("пустое имя → 400", async () => {
      const { token } = await signUp(app);
      await create(token, { name: "  " }).expect(400);
    });

    it("без аутентификации → 401", async () => {
      await request(app.getHttpServer()).post("/v1/workspaces").send({ name: "X" }).expect(401);
    });
  });

  describe("GET /v1/workspaces", () => {
    it("возвращает доски орга со счётчиком фаз, без самих фаз", async () => {
      const { token } = await signUp(app);
      await create(token, { name: "A" }).expect(201);
      await create(token, { name: "B" }).expect(201);

      const res = await request(app.getHttpServer())
        .get("/v1/workspaces")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].phaseCount).toBe(4);
      expect(res.body.data[0].phases).toBeUndefined();
    });

    it("не показывает доски чужой орги (tenant-изоляция)", async () => {
      const mine = await signUp(app);
      const stranger = await signUp(app);
      await create(mine.token, { name: "Mine" }).expect(201);
      await create(stranger.token, { name: "Theirs" }).expect(201);

      const res = await request(app.getHttpServer())
        .get("/v1/workspaces")
        .set("Authorization", `Bearer ${mine.token}`)
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe("Mine");
    });
  });

  describe("GET /v1/workspaces/:id", () => {
    it("возвращает доску с упорядоченными фазами", async () => {
      const { token } = await signUp(app);
      const created = await create(token, { name: "Detail" }).expect(201);

      const res = await request(app.getHttpServer())
        .get(`/v1/workspaces/${created.body.data.id}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body.data.id).toBe(created.body.data.id);
      expect(res.body.data.phases.map((p: { order: number }) => p.order)).toEqual([1, 2, 3, 4]);
    });

    it("чужая доска → 404, а не 403 (не подтверждаем существование)", async () => {
      const mine = await signUp(app);
      const stranger = await signUp(app);
      const theirs = await create(stranger.token, { name: "Theirs" }).expect(201);

      const res = await request(app.getHttpServer())
        .get(`/v1/workspaces/${theirs.body.data.id}`)
        .set("Authorization", `Bearer ${mine.token}`)
        .expect(404);

      expect(res.body.error.code).toBe("NOT_FOUND");
    });

    it("несуществующая доска → 404", async () => {
      const { token } = await signUp(app);
      await request(app.getHttpServer())
        .get("/v1/workspaces/ws_does_not_exist")
        .set("Authorization", `Bearer ${token}`)
        .expect(404);
    });
  });
});
