import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@helix/db";
import { createTestApp } from "../helpers/create-test-app";

let counter = 0;

async function signUp(app: INestApplication): Promise<{ token: string; orgId: string }> {
  const email = `delph${counter++}@example.com`;
  const res = await request(app.getHttpServer())
    .post("/v1/auth/register")
    .send({ email, name: "User", password: "correct horse battery staple" })
    .expect(201);
  const token = res.body.data.accessToken as string;
  const orgId = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString()).activeOrgId;
  return { token, orgId };
}

describe("DELETE /v1/phases/:id", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const makeBoard = async (token: string): Promise<{ id: string; phaseIds: string[] }> => {
    const res = await request(app.getHttpServer())
      .post("/v1/workspaces")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Board" })
      .expect(201);
    return { id: res.body.data.id, phaseIds: res.body.data.phases.map((p: { id: string }) => p.id) };
  };

  const getBoard = (token: string, id: string) =>
    request(app.getHttpServer()).get(`/v1/workspaces/${id}`).set("Authorization", `Bearer ${token}`);

  const delPhase = (token: string, id: string, reassignTo?: string) => {
    const url = reassignTo ? `/v1/phases/${id}?reassignTo=${reassignTo}` : `/v1/phases/${id}`;
    return request(app.getHttpServer()).delete(url).set("Authorization", `Bearer ${token}`);
  };

  const addProject = (orgId: string, workspaceId: string, phaseId: string) =>
    prisma.project.create({ data: { orgId, workspaceId, phaseId, title: "Lead", rank: "a0" } });

  describe("пустая фаза", () => {
    it("удаляется сразу, оставшиеся уплотняются в 1..n, version++", async () => {
      const { token } = await signUp(app);
      const board = await makeBoard(token); // [lead,in-progress,won,lost]

      await delPhase(token, board.phaseIds[1]!).expect(200); // удаляем order 2

      const after = await getBoard(token, board.id).expect(200);
      const phases = after.body.data.phases as Array<{ key: string; order: number }>;
      expect(phases.map((p) => p.key)).toEqual(["lead", "won", "lost"]);
      expect(phases.map((p) => p.order)).toEqual([1, 2, 3]);
      expect(after.body.data.version).toBe(1);
    });

    it("можно удалить все фазы — доска остаётся пустой", async () => {
      const { token } = await signUp(app);
      const board = await makeBoard(token);

      for (const id of board.phaseIds) {
        await delPhase(token, id).expect(200);
      }
      const after = await getBoard(token, board.id).expect(200);
      expect(after.body.data.phases).toHaveLength(0);
    });
  });

  describe("непустая фаза", () => {
    it("без reassignTo → 409 PHASE_NOT_EMPTY со списком кандидатов", async () => {
      const { token, orgId } = await signUp(app);
      const board = await makeBoard(token);
      await addProject(orgId, board.id, board.phaseIds[0]!);

      const res = await delPhase(token, board.phaseIds[0]!).expect(409);
      expect(res.body.error.code).toBe("PHASE_NOT_EMPTY");
      // Кандидаты — остальные фазы воркспейса (без удаляемой).
      expect(res.body.error.details).toHaveLength(3);
    });

    it("с reassignTo → проекты переехали, фаза удалена", async () => {
      const { token, orgId } = await signUp(app);
      const board = await makeBoard(token);
      await addProject(orgId, board.id, board.phaseIds[0]!);

      await delPhase(token, board.phaseIds[0]!, board.phaseIds[1]!).expect(200);

      expect(await prisma.project.count({ where: { phaseId: board.phaseIds[0]! } })).toBe(0);
      expect(await prisma.project.count({ where: { phaseId: board.phaseIds[1]! } })).toBe(1);
      expect(await prisma.phase.count({ where: { id: board.phaseIds[0]! } })).toBe(0);
    });

    it("reassignTo из другого воркспейса → 400", async () => {
      const { token, orgId } = await signUp(app);
      const board = await makeBoard(token);
      const other = await makeBoard(token);
      await addProject(orgId, board.id, board.phaseIds[0]!);

      const res = await delPhase(token, board.phaseIds[0]!, other.phaseIds[0]!).expect(400);
      expect(res.body.error.code).toBe("INVALID_REASSIGN_TARGET");
    });

    it("reassignTo === удаляемой фазе → 400", async () => {
      const { token, orgId } = await signUp(app);
      const board = await makeBoard(token);
      await addProject(orgId, board.id, board.phaseIds[0]!);

      await delPhase(token, board.phaseIds[0]!, board.phaseIds[0]!).expect(400);
    });
  });

  describe("authz / tenant", () => {
    it("MEMBER → 403", async () => {
      const { token } = await signUp(app);
      const board = await makeBoard(token);
      await prisma.membership.updateMany({ data: { role: "MEMBER" } });

      await delPhase(token, board.phaseIds[0]!).expect(403);
    });

    it("чужая фаза → 404", async () => {
      const owner = await signUp(app);
      const board = await makeBoard(owner.token);
      const stranger = await signUp(app);

      await delPhase(stranger.token, board.phaseIds[0]!).expect(404);
    });
  });
});
