import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@helix/db";
import { createTestApp } from "../helpers/create-test-app";

let counter = 0;

async function signUp(app: INestApplication): Promise<string> {
  const email = `phase${counter++}@example.com`;
  const res = await request(app.getHttpServer())
    .post("/v1/auth/register")
    .send({ email, name: "User", password: "correct horse battery staple" })
    .expect(201);
  return res.body.data.accessToken as string;
}

interface Board {
  id: string;
  version: number;
}

describe("Phases (unit D: add / update)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const makeBoard = async (token: string): Promise<Board> => {
    const res = await request(app.getHttpServer())
      .post("/v1/workspaces")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Board" })
      .expect(201);
    return { id: res.body.data.id, version: res.body.data.version };
  };

  const addPhase = (token: string, wsId: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post(`/v1/workspaces/${wsId}/phases`)
      .set("Authorization", `Bearer ${token}`)
      .send(body);

  const getBoard = (token: string, wsId: string) =>
    request(app.getHttpServer()).get(`/v1/workspaces/${wsId}`).set("Authorization", `Bearer ${token}`);

  describe("POST /v1/workspaces/:id/phases", () => {
    it("добавляет фазу в конец (order = max+1)", async () => {
      const token = await signUp(app);
      const board = await makeBoard(token); // 4 дефолтных фазы

      const res = await addPhase(token, board.id, { name: { en: "Discovery" } }).expect(201);
      expect(res.body.data.order).toBe(5);
      expect(res.body.data.type).toBe("OPEN"); // дефолт из Zod
    });

    it("генерит key из name (en → слаг)", async () => {
      const token = await signUp(app);
      const board = await makeBoard(token);

      const res = await addPhase(token, board.id, { name: { en: "Deal Won!!!" } }).expect(201);
      expect(res.body.data.key).toBe("deal-won");
    });

    it("коллизия key → суффикс -2", async () => {
      const token = await signUp(app);
      const board = await makeBoard(token);

      const a = await addPhase(token, board.id, { name: { en: "Discovery" } }).expect(201);
      const b = await addPhase(token, board.id, { name: { en: "Discovery" } }).expect(201);
      expect(a.body.data.key).toBe("discovery");
      expect(b.body.data.key).toBe("discovery-2");
    });

    it("кириллица → транслит", async () => {
      const token = await signUp(app);
      const board = await makeBoard(token);

      const res = await addPhase(token, board.id, { name: { ru: "Переговоры" } }).expect(201);
      expect(res.body.data.key).toBe("peregovory");
    });

    it("пустой слаг (эмодзи) → fallback 'phase', затем 'phase-2'", async () => {
      const token = await signUp(app);
      const board = await makeBoard(token);

      const a = await addPhase(token, board.id, { name: { en: "🔥🔥" } }).expect(201);
      const b = await addPhase(token, board.id, { name: { en: "😀" } }).expect(201);
      expect(a.body.data.key).toBe("phase");
      expect(b.body.data.key).toBe("phase-2");
    });

    it("создание фазы бампает version доски (§4)", async () => {
      const token = await signUp(app);
      const board = await makeBoard(token);
      expect(board.version).toBe(0);

      await addPhase(token, board.id, { name: { en: "X" } }).expect(201);

      const after = await getBoard(token, board.id).expect(200);
      expect(after.body.data.version).toBe(1);
    });

    it("MEMBER → 403", async () => {
      const token = await signUp(app);
      const board = await makeBoard(token);
      await prisma.membership.updateMany({ data: { role: "MEMBER" } });

      await addPhase(token, board.id, { name: { en: "X" } }).expect(403);
    });

    it("чужая доска → 404", async () => {
      const owner = await signUp(app);
      const board = await makeBoard(owner);
      const stranger = await signUp(app);

      await addPhase(stranger, board.id, { name: { en: "X" } }).expect(404);
    });

    it("невалидное имя → 400", async () => {
      const token = await signUp(app);
      const board = await makeBoard(token);
      await addPhase(token, board.id, { name: {} }).expect(400);
    });
  });

  describe("PATCH /v1/phases/:id", () => {
    const firstPhaseId = async (token: string, wsId: string): Promise<string> => {
      const res = await getBoard(token, wsId).expect(200);
      return res.body.data.phases[0].id;
    };

    it("меняет name/color/type", async () => {
      const token = await signUp(app);
      const board = await makeBoard(token);
      const id = await firstPhaseId(token, board.id);

      const res = await request(app.getHttpServer())
        .patch(`/v1/phases/${id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ name: { en: "Renamed" }, color: "#ff0000" })
        .expect(200);

      expect(res.body.data.name).toEqual({ en: "Renamed" });
      expect(res.body.data.color).toBe("#ff0000");
    });

    it("key и order неизменны (в теле игнорируются)", async () => {
      const token = await signUp(app);
      const board = await makeBoard(token);
      const id = await firstPhaseId(token, board.id); // "lead", order 1

      const res = await request(app.getHttpServer())
        .patch(`/v1/phases/${id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ key: "hacked", order: 99, name: { en: "Lead 2" } })
        .expect(200);

      expect(res.body.data.key).toBe("lead");
      expect(res.body.data.order).toBe(1);
    });

    it("PATCH атрибутов НЕ бампает version (§4: только состав/порядок)", async () => {
      const token = await signUp(app);
      const board = await makeBoard(token);
      const id = await firstPhaseId(token, board.id);

      await request(app.getHttpServer())
        .patch(`/v1/phases/${id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ color: "#123456" })
        .expect(200);

      const after = await getBoard(token, board.id).expect(200);
      expect(after.body.data.version).toBe(0);
    });

    it("MEMBER → 403", async () => {
      const token = await signUp(app);
      const board = await makeBoard(token);
      const id = await firstPhaseId(token, board.id);
      await prisma.membership.updateMany({ data: { role: "MEMBER" } });

      await request(app.getHttpServer())
        .patch(`/v1/phases/${id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ color: "#000000" })
        .expect(403);
    });

    it("чужая фаза → 404", async () => {
      const owner = await signUp(app);
      const board = await makeBoard(owner);
      const id = await firstPhaseId(owner, board.id);
      const stranger = await signUp(app);

      await request(app.getHttpServer())
        .patch(`/v1/phases/${id}`)
        .set("Authorization", `Bearer ${stranger}`)
        .send({ color: "#000000" })
        .expect(404);
    });
  });
});
