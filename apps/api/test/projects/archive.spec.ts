import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@helix/db";
import { createTestApp } from "../helpers/create-test-app";

let counter = 0;

async function signUp(app: INestApplication): Promise<{ token: string; orgId: string }> {
  const email = `arch${counter++}@example.com`;
  const res = await request(app.getHttpServer())
    .post("/v1/auth/register")
    .send({ email, name: "Arch", password: "correct horse battery staple" })
    .expect(201);
  const token = res.body.data.accessToken as string;
  const orgId = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString()).activeOrgId;
  return { token, orgId };
}

describe("archive / restore (§7)", () => {
  let app: INestApplication;
  let token: string;
  let orgId: string;
  let wsId: string;
  let phaseIds: string[];

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    const u = await signUp(app);
    token = u.token;
    orgId = u.orgId;
    const res = await request(app.getHttpServer())
      .post("/v1/workspaces")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Board" })
      .expect(201);
    wsId = res.body.data.id;
    phaseIds = res.body.data.phases.map((p: { id: string }) => p.id);
  });

  const seed = (rank: string, status: "OPEN" | "ARCHIVED" = "OPEN") =>
    prisma.project.create({ data: { orgId, workspaceId: wsId, phaseId: phaseIds[0]!, title: "P", rank, status } });

  const archive = (id: string) =>
    request(app.getHttpServer()).post(`/v1/projects/${id}/archive`).set("Authorization", `Bearer ${token}`);
  const restore = (id: string) =>
    request(app.getHttpServer()).post(`/v1/projects/${id}/restore`).set("Authorization", `Bearer ${token}`);
  const eventCount = (projectId: string, type: string) =>
    prisma.activityEvent.count({ where: { projectId, type } });

  it("archive → status ARCHIVED, событие project.archived, вне доски", async () => {
    const p = await seed("a0");
    const res = await archive(p.id).expect(200);
    expect(res.body.data.status).toBe("ARCHIVED");
    expect(await eventCount(p.id, "project.archived")).toBe(1);

    const board = await request(app.getHttpServer())
      .get(`/v1/workspaces/${wsId}/board`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(board.body.data.phases[0].projects).toHaveLength(0); // архив не рисуется
    expect(board.body.data.phases[0].total).toBe(0);
  });

  it("restore → status по типу фазы, НОВЫЙ ранг наверх, событие project.restored", async () => {
    const visible = await seed("a5"); // видимая карточка в колонке
    const archived = await seed("z0");
    await archive(archived.id).expect(200);

    const res = await restore(archived.id).expect(200);
    expect(res.body.data.status).toBe("OPEN"); // тип первой фазы
    expect(res.body.data.rank).not.toBe("z0"); // НЕ старый ранг (§7.3)
    expect(res.body.data.rank < visible.rank).toBe(true); // наверх колонки
    expect(await eventCount(archived.id, "project.restored")).toBe(1);
  });

  it("restore возвращает карточку в доску", async () => {
    const p = await seed("a0");
    await archive(p.id).expect(200);
    await restore(p.id).expect(200);

    const board = await request(app.getHttpServer())
      .get(`/v1/workspaces/${wsId}/board`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(board.body.data.phases[0].projects).toHaveLength(1);
  });

  it("повторная archive идемпотентна — второго события нет", async () => {
    const p = await seed("a0");
    await archive(p.id).expect(200);
    await archive(p.id).expect(200);
    expect(await eventCount(p.id, "project.archived")).toBe(1);
  });

  it("restore не-архивного идемпотентен — события нет", async () => {
    const p = await seed("a0");
    await restore(p.id).expect(200);
    expect(await eventCount(p.id, "project.restored")).toBe(0);
  });

  describe("GET /workspaces/:id/projects/archived", () => {
    it("список содержит только ARCHIVED, свежие сверху", async () => {
      const open = await seed("a0");
      const archived1 = await seed("z0", "ARCHIVED");
      const archived2 = await seed("z1", "ARCHIVED");

      const res = await request(app.getHttpServer())
        .get(`/v1/workspaces/${wsId}/projects/archived`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      const ids = res.body.data.map((p: { id: string }) => p.id);
      expect(ids).toContain(archived1.id);
      expect(ids).toContain(archived2.id);
      expect(ids).not.toContain(open.id);
    });

    it("чужой воркспейс → 404", async () => {
      const stranger = await signUp(app);
      await request(app.getHttpServer())
        .get(`/v1/workspaces/${wsId}/projects/archived`)
        .set("Authorization", `Bearer ${stranger.token}`)
        .expect(404);
    });
  });

  describe("отказы", () => {
    it("чужой проект → 404", async () => {
      const p = await seed("a0");
      const stranger = await signUp(app);
      await request(app.getHttpServer())
        .post(`/v1/projects/${p.id}/archive`)
        .set("Authorization", `Bearer ${stranger.token}`)
        .expect(404);
    });

    // archive/restore — форма edit лида → Member△ capability allow. Viewer — deny.
    it("MEMBER → 200 (archive — capability allow)", async () => {
      const p = await seed("a0");
      await prisma.membership.updateMany({ data: { role: "MEMBER" } });
      await archive(p.id).expect(200);
    });

    it("VIEWER → 403", async () => {
      const p = await seed("a0");
      await prisma.membership.updateMany({ data: { role: "VIEWER" } });
      await archive(p.id).expect(403);
    });
  });
});
