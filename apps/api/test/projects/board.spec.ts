import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@helix/db";
import { createTestApp } from "../helpers/create-test-app";

let counter = 0;

async function signUp(app: INestApplication): Promise<{ token: string; orgId: string }> {
  const email = `board${counter++}@example.com`;
  const res = await request(app.getHttpServer())
    .post("/v1/auth/register")
    .send({ email, name: "Founder", password: "correct horse battery staple" })
    .expect(201);
  const token = res.body.data.accessToken as string;
  const orgId = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString()).activeOrgId;
  return { token, orgId };
}

describe("Board + column pagination (§8)", () => {
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

  const seed = (
    orgId: string,
    workspaceId: string,
    phaseId: string,
    rank: string,
    status: "OPEN" | "ARCHIVED" = "OPEN",
  ) => prisma.project.create({ data: { orgId, workspaceId, phaseId, title: `P-${rank}`, rank, status } });

  const getBoard = (token: string, wsId: string, limitPerPhase?: number) => {
    const q = limitPerPhase === undefined ? "" : `?limitPerPhase=${limitPerPhase}`;
    return request(app.getHttpServer())
      .get(`/v1/workspaces/${wsId}/board${q}`)
      .set("Authorization", `Bearer ${token}`);
  };

  describe("GET /board", () => {
    it("фазы в порядке доски, каждая со своими карточками и version", async () => {
      const { token, orgId } = await signUp(app);
      const board = await makeBoard(token);
      await seed(orgId, board.id, board.phaseIds[0]!, "a0");
      await seed(orgId, board.id, board.phaseIds[1]!, "a0");

      const res = await getBoard(token, board.id).expect(200);
      const data = res.body.data;
      expect(data.version).toBe(0);
      expect(data.phases).toHaveLength(4);
      expect(data.phases[0].projects).toHaveLength(1);
      expect(data.phases[1].projects).toHaveLength(1);
      expect(data.phases[2].projects).toHaveLength(0);
    });

    it("limitPerPhase соблюдается, total = COUNT, hasMore корректен", async () => {
      const { token, orgId } = await signUp(app);
      const board = await makeBoard(token);
      for (const r of ["a0", "a1", "a2", "a3", "a4"]) await seed(orgId, board.id, board.phaseIds[0]!, r);

      const res = await getBoard(token, board.id, 2).expect(200);
      const col = res.body.data.phases[0];
      expect(col.projects).toHaveLength(2); // limit
      expect(col.total).toBe(5); // COUNT из всей колонки, не из выборки
      expect(col.hasMore).toBe(true);
    });

    it("архивные не попадают в доску и не учитываются в total", async () => {
      const { token, orgId } = await signUp(app);
      const board = await makeBoard(token);
      await seed(orgId, board.id, board.phaseIds[0]!, "a0", "OPEN");
      await seed(orgId, board.id, board.phaseIds[0]!, "a1", "ARCHIVED");

      const col = (await getBoard(token, board.id).expect(200)).body.data.phases[0];
      expect(col.projects).toHaveLength(1);
      expect(col.total).toBe(1);
      expect(col.hasMore).toBe(false);
    });

    it("карточки колонки упорядочены по rank", async () => {
      const { token, orgId } = await signUp(app);
      const board = await makeBoard(token);
      for (const r of ["a2", "a0", "a1"]) await seed(orgId, board.id, board.phaseIds[0]!, r);

      const col = (await getBoard(token, board.id).expect(200)).body.data.phases[0];
      expect(col.projects.map((p: { rank: string }) => p.rank)).toEqual(["a0", "a1", "a2"]);
    });

    it("чужая доска → 404", async () => {
      const owner = await signUp(app);
      const board = await makeBoard(owner.token);
      const stranger = await signUp(app);
      await getBoard(stranger.token, board.id).expect(404);
    });
  });

  describe("GET /phases/:id/projects (keyset)", () => {
    const column = (token: string, phaseId: string, cursorRank?: string, cursorId?: string, limit = 2) => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (cursorRank !== undefined) params.set("cursorRank", cursorRank);
      if (cursorId !== undefined) params.set("cursorId", cursorId);
      return request(app.getHttpServer())
        .get(`/v1/phases/${phaseId}/projects?${params.toString()}`)
        .set("Authorization", `Bearer ${token}`);
    };

    it("keyset не дублирует и не теряет карточки на границе РАВНЫХ рангов", async () => {
      const { token, orgId } = await signUp(app);
      const board = await makeBoard(token);
      const phaseId = board.phaseIds[0]!;
      // Два ранга 'a1' с разными id — tie-break по id (§4.2).
      for (const r of ["a0", "a1", "a1", "a2"]) await seed(orgId, board.id, phaseId, r);

      const all = (await column(token, phaseId, undefined, undefined, 100).expect(200)).body.data.projects;
      expect(all).toHaveLength(4);

      const page1 = (await column(token, phaseId, undefined, undefined, 2).expect(200)).body.data;
      expect(page1.projects).toHaveLength(2);
      expect(page1.hasMore).toBe(true);

      const last = page1.projects[1];
      const page2 = (await column(token, phaseId, last.rank, last.id, 2).expect(200)).body.data;

      const seen = [...page1.projects, ...page2.projects].map((p: { id: string }) => p.id);
      expect(new Set(seen).size).toBe(4); // без дублей
      expect(seen.sort()).toEqual(all.map((p: { id: string }) => p.id).sort()); // без потерь
    });

    it("чужая фаза → 404", async () => {
      const owner = await signUp(app);
      const board = await makeBoard(owner.token);
      const stranger = await signUp(app);
      await column(stranger.token, board.phaseIds[0]!).expect(404);
    });
  });
});
