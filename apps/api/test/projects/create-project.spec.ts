import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@helix/db";
import { createTestApp } from "../helpers/create-test-app";

let counter = 0;

async function signUp(app: INestApplication): Promise<{ token: string; orgId: string }> {
  const email = `proj${counter++}@example.com`;
  const res = await request(app.getHttpServer())
    .post("/v1/auth/register")
    .send({ email, name: "Founder", password: "correct horse battery staple" })
    .expect(201);
  const token = res.body.data.accessToken as string;
  const orgId = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString()).activeOrgId;
  return { token, orgId };
}

describe("POST /v1/workspaces/:id/projects", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const makeBoard = async (token: string): Promise<{ id: string; firstPhaseId: string }> => {
    const res = await request(app.getHttpServer())
      .post("/v1/workspaces")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Board" })
      .expect(201);
    return { id: res.body.data.id, firstPhaseId: res.body.data.phases[0].id };
  };

  const create = (token: string, wsId: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post(`/v1/workspaces/${wsId}/projects`)
      .set("Authorization", `Bearer ${token}`)
      .send(body);

  it("создаёт лид в ПЕРВОЙ фазе со статусом OPEN", async () => {
    const { token } = await signUp(app);
    const board = await makeBoard(token);

    const res = await create(token, board.id, { title: "Acme deal" }).expect(201);
    expect(res.body.data.title).toBe("Acme deal");
    expect(res.body.data.phaseId).toBe(board.firstPhaseId); // "lead" — первая
    expect(res.body.data.status).toBe("OPEN");
    expect(res.body.data.rank).toBeTruthy();
  });

  it("новые лиды идут НАВЕРХ колонки (§3.3)", async () => {
    const { token } = await signUp(app);
    const board = await makeBoard(token);

    const first = await create(token, board.id, { title: "First" }).expect(201);
    const second = await create(token, board.id, { title: "Second" }).expect(201);

    // second создан позже → его ранг меньше (выше), чем у first.
    expect(second.body.data.rank < first.body.data.rank).toBe(true);
  });

  it("пишет событие project.created (P4) с именем актора", async () => {
    const { token } = await signUp(app);
    const board = await makeBoard(token);
    const res = await create(token, board.id, { title: "Lead" }).expect(201);

    const events = await prisma.activityEvent.findMany({ where: { projectId: res.body.data.id } });
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("project.created");
    expect((events[0]?.payload as { actorName: string }).actorName).toBe("Founder");
  });

  it("принимает value/currency/source/owner", async () => {
    const { token, orgId } = await signUp(app);
    const board = await makeBoard(token);
    const owner = await prisma.user.findFirst({ where: { memberships: { some: { orgId } } } });

    const res = await create(token, board.id, {
      title: "Big deal",
      value: 15000.5,
      currency: "USD",
      source: "referral",
      ownerId: owner?.id,
    }).expect(201);

    expect(res.body.data.value).toBe(15000.5);
    expect(res.body.data.currency).toBe("USD");
    expect(res.body.data.source).toBe("referral");
    expect(res.body.data.ownerId).toBe(owner?.id);
  });

  it("ownerId не передан → дефолт создатель (decisions.md ADR)", async () => {
    const { token } = await signUp(app);
    const board = await makeBoard(token);
    const claims = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString());

    const res = await create(token, board.id, { title: "Lead" }).expect(201);
    expect(res.body.data.ownerId).toBe(claims.sub);
  });

  it("явный ownerId — участник орги → 201, дефолт не применяется", async () => {
    const { token, orgId } = await signUp(app);
    const board = await makeBoard(token);
    const other = await prisma.user.create({ data: { email: `owner${counter++}@example.com`, name: "Other", passwordHash: "x" } });
    await prisma.membership.create({ data: { orgId, userId: other.id, role: "MEMBER" } });

    const res = await create(token, board.id, { title: "Lead", ownerId: other.id }).expect(201);
    expect(res.body.data.ownerId).toBe(other.id);
  });

  it("ownerId — юзер чужой орги → 400 USER_NOT_ORG_MEMBER", async () => {
    const { token } = await signUp(app);
    const board = await makeBoard(token);
    const stranger = await signUp(app);
    const strangerClaims = JSON.parse(Buffer.from(stranger.token.split(".")[1] ?? "", "base64url").toString());

    const res = await create(token, board.id, { title: "Lead", ownerId: strangerClaims.sub }).expect(400);
    expect(res.body.error.code).toBe("USER_NOT_ORG_MEMBER");
  });

  describe("отказы", () => {
    it("пустой title → 400", async () => {
      const { token } = await signUp(app);
      const board = await makeBoard(token);
      await create(token, board.id, { title: "  " }).expect(400);
    });

    it("кривой currency → 400", async () => {
      const { token } = await signUp(app);
      const board = await makeBoard(token);
      await create(token, board.id, { title: "x", currency: "usd" }).expect(400);
    });

    // Матрица: «Create/edit leads» Member△ → capability allow (scope=ORG в M1). Viewer — deny.
    it("MEMBER → 201 (create lead — capability allow)", async () => {
      const { token } = await signUp(app);
      const board = await makeBoard(token);
      await prisma.membership.updateMany({ data: { role: "MEMBER" } });
      await create(token, board.id, { title: "x" }).expect(201);
    });

    it("VIEWER → 403", async () => {
      const { token } = await signUp(app);
      const board = await makeBoard(token);
      await prisma.membership.updateMany({ data: { role: "VIEWER" } });
      await create(token, board.id, { title: "x" }).expect(403);
    });

    it("чужой воркспейс → 404", async () => {
      const owner = await signUp(app);
      const board = await makeBoard(owner.token);
      const stranger = await signUp(app);
      await create(stranger.token, board.id, { title: "x" }).expect(404);
    });

    it("доска без фаз → 409 WORKSPACE_HAS_NO_PHASES", async () => {
      const { token } = await signUp(app);
      const board = await makeBoard(token);
      // удаляем все фазы
      const phases = await prisma.phase.findMany({ where: { workspaceId: board.id } });
      for (const p of phases) {
        await request(app.getHttpServer())
          .delete(`/v1/phases/${p.id}`)
          .set("Authorization", `Bearer ${token}`)
          .expect(200);
      }

      const res = await create(token, board.id, { title: "x" }).expect(409);
      expect(res.body.error.code).toBe("WORKSPACE_HAS_NO_PHASES");
    });
  });
});
