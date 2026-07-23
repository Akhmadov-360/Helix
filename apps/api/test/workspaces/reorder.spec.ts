import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@helix/db";
import { createTestApp } from "../helpers/create-test-app";

let counter = 0;

async function signUp(app: INestApplication): Promise<string> {
  const email = `reorder${counter++}@example.com`;
  const res = await request(app.getHttpServer())
    .post("/v1/auth/register")
    .send({ email, name: "User", password: "correct horse battery staple" })
    .expect(201);
  return res.body.data.accessToken as string;
}

interface Board {
  id: string;
  phaseIds: string[];
  version: number;
}

describe("POST /v1/workspaces/:id/phases/reorder", () => {
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
    return {
      id: res.body.data.id,
      phaseIds: res.body.data.phases.map((p: { id: string }) => p.id),
      version: res.body.data.version,
    };
  };

  const reorder = (token: string, wsId: string, phaseIds: string[], version: number) =>
    request(app.getHttpServer())
      .post(`/v1/workspaces/${wsId}/phases/reorder`)
      .set("Authorization", `Bearer ${token}`)
      .send({ phaseIds, version });

  it("нормализует в плотные 1..n в присланном порядке", async () => {
    const token = await signUp(app);
    const board = await makeBoard(token);
    const reversed = [...board.phaseIds].reverse();

    const res = await reorder(token, board.id, reversed, board.version).expect(200);

    const phases = res.body.data.phases as Array<{ id: string; order: number }>;
    expect(phases.map((p) => p.id)).toEqual(reversed);
    expect(phases.map((p) => p.order)).toEqual([1, 2, 3, 4]);
  });

  it("успешный reorder бампает version", async () => {
    const token = await signUp(app);
    const board = await makeBoard(token);

    const res = await reorder(token, board.id, board.phaseIds, board.version).expect(200);
    expect(res.body.data.version).toBe(board.version + 1);
  });

  it("порядок реально сохраняется в БД (перечитали)", async () => {
    const token = await signUp(app);
    const board = await makeBoard(token);
    const reversed = [...board.phaseIds].reverse();

    await reorder(token, board.id, reversed, board.version).expect(200);

    const after = await request(app.getHttpServer())
      .get(`/v1/workspaces/${board.id}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(after.body.data.phases.map((p: { id: string }) => p.id)).toEqual(reversed);
  });

  describe("валидация набора → 400 INCOMPLETE_PHASE_SET", () => {
    it("неполный список", async () => {
      const token = await signUp(app);
      const board = await makeBoard(token);

      const res = await reorder(token, board.id, board.phaseIds.slice(0, 3), board.version).expect(400);
      expect(res.body.error.code).toBe("INCOMPLETE_PHASE_SET");
    });

    it("чужая фаза в списке (та же длина)", async () => {
      const token = await signUp(app);
      const board = await makeBoard(token);
      const swapped = [...board.phaseIds];
      swapped[0] = "ph_foreign";

      await reorder(token, board.id, swapped, board.version).expect(400);
    });

    it("дубли в списке", async () => {
      const token = await signUp(app);
      const board = await makeBoard(token);
      const dup = [board.phaseIds[0]!, board.phaseIds[0]!, board.phaseIds[1]!, board.phaseIds[2]!];

      await reorder(token, board.id, dup, board.version).expect(400);
    });
  });

  describe("optimistic lock → 409", () => {
    it("устаревший version → 409 WORKSPACE_VERSION_CONFLICT", async () => {
      const token = await signUp(app);
      const board = await makeBoard(token);

      const res = await reorder(token, board.id, board.phaseIds, board.version + 5).expect(409);
      expect(res.body.error.code).toBe("WORKSPACE_VERSION_CONFLICT");
    });

    it("lost-update (§4): A читает v0, B добавляет фазу, A шлёт reorder с v0 → 409", async () => {
      const token = await signUp(app);
      const board = await makeBoard(token); // version 0

      // B добавляет фазу → version становится 1.
      await request(app.getHttpServer())
        .post(`/v1/workspaces/${board.id}/phases`)
        .set("Authorization", `Bearer ${token}`)
        .send({ name: { en: "Discovery" } })
        .expect(201);

      // A всё ещё думает, что version 0 и фаз четыре → version-конфликт ловится ПЕРВЫМ.
      const res = await reorder(token, board.id, board.phaseIds, 0).expect(409);
      expect(res.body.error.code).toBe("WORKSPACE_VERSION_CONFLICT");
    });

    it("после version-конфликта порядок и version НЕ изменились (откат)", async () => {
      const token = await signUp(app);
      const board = await makeBoard(token);

      await reorder(token, board.id, [...board.phaseIds].reverse(), 999).expect(409);

      const after = await request(app.getHttpServer())
        .get(`/v1/workspaces/${board.id}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(after.body.data.version).toBe(0);
      expect(after.body.data.phases.map((p: { id: string }) => p.id)).toEqual(board.phaseIds);
    });
  });

  describe("authz / tenant", () => {
    it("MEMBER → 403", async () => {
      const token = await signUp(app);
      const board = await makeBoard(token);
      await prisma.membership.updateMany({ data: { role: "MEMBER" } });

      await reorder(token, board.id, board.phaseIds, board.version).expect(403);
    });

    it("чужая доска → 404", async () => {
      const owner = await signUp(app);
      const board = await makeBoard(owner);
      const stranger = await signUp(app);

      await reorder(stranger, board.id, board.phaseIds, board.version).expect(404);
    });
  });
});
