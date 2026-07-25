import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@helix/db";
import { createTestApp } from "../helpers/create-test-app";

let counter = 0;

async function signUp(app: INestApplication): Promise<{ token: string; orgId: string }> {
  const email = `retro${counter++}@example.com`;
  const res = await request(app.getHttpServer())
    .post("/v1/auth/register")
    .send({ email, name: "User", password: "correct horse battery staple" })
    .expect(201);
  const token = res.body.data.accessToken as string;
  const orgId = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString()).activeOrgId;
  return { token, orgId };
}

/**
 * §12 ретро-страж для среза 1 (delete-phase). ARCHIVED-лид физически остаётся в
 * своей фазе (§7: phaseId NOT NULL), поэтому перенос при удалении фазы обязан
 * захватывать И архивные — иначе onDelete: Restrict заблокирует удаление фазы,
 * которая с точки зрения доски пуста. Тест краснеет, если кто-то отфильтрует
 * countByPhase/reassignPhase по status<>'ARCHIVED'.
 */
describe("§12 retro: delete-phase переносит архивные проекты", () => {
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

  const archivedProject = (orgId: string, workspaceId: string, phaseId: string) =>
    prisma.project.create({
      data: { orgId, workspaceId, phaseId, title: "Archived Lead", status: "ARCHIVED", rank: "a0" },
    });

  it("фаза с одним архивным лидом без reassignTo → 409 + кандидаты (не выглядит пустой)", async () => {
    const { token, orgId } = await signUp(app);
    const board = await makeBoard(token);
    await archivedProject(orgId, board.id, board.phaseIds[0]!);

    const res = await request(app.getHttpServer())
      .delete(`/v1/phases/${board.phaseIds[0]!}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(409);

    expect(res.body.error.code).toBe("PHASE_NOT_EMPTY");
    expect(res.body.error.details).toHaveLength(3);
  });

  it("с reassignTo → архивный лид переехал, фаза удалена", async () => {
    const { token, orgId } = await signUp(app);
    const board = await makeBoard(token);
    const archived = await archivedProject(orgId, board.id, board.phaseIds[0]!);

    await request(app.getHttpServer())
      .delete(`/v1/phases/${board.phaseIds[0]!}?reassignTo=${board.phaseIds[1]!}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const moved = await prisma.project.findUnique({ where: { id: archived.id } });
    expect(moved?.phaseId).toBe(board.phaseIds[1]!);
    expect(moved?.status).toBe("ARCHIVED"); // перенос не воскрешает архив
    expect(await prisma.phase.count({ where: { id: board.phaseIds[0]! } })).toBe(0);
  });
});
