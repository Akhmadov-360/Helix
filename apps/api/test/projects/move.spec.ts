import type { INestApplication } from "@nestjs/common";
import { generateKeyBetween } from "fractional-indexing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@helix/db";
import { createTestApp } from "../helpers/create-test-app";

let counter = 0;

async function signUp(app: INestApplication): Promise<{ token: string; orgId: string }> {
  const email = `move${counter++}@example.com`;
  const res = await request(app.getHttpServer())
    .post("/v1/auth/register")
    .send({ email, name: "Mover", password: "correct horse battery staple" })
    .expect(201);
  const token = res.body.data.accessToken as string;
  const orgId = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString()).activeOrgId;
  return { token, orgId };
}

describe("POST /v1/projects/:id/move (§5)", () => {
  let app: INestApplication;
  let token: string;
  let orgId: string;
  let wsId: string;
  let phaseIds: string[]; // [lead OPEN, in-progress OPEN, won WON, lost LOST]

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

  const seed = (phaseId: string, rank: string, status: "OPEN" | "ARCHIVED" = "OPEN") =>
    prisma.project.create({ data: { orgId, workspaceId: wsId, phaseId, title: `P-${rank}`, rank, status } });

  const move = (id: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post(`/v1/projects/${id}/move`)
      .set("Authorization", `Bearer ${token}`)
      .send(body);

  const movedEvents = (projectId: string) =>
    prisma.activityEvent.count({ where: { projectId, type: "project.moved" } });

  it("reorder внутри фазы: ранг между соседями, БЕЗ события, статус не меняется", async () => {
    const a = await seed(phaseIds[0]!, "a0");
    const b = await seed(phaseIds[0]!, "a2");
    const x = await seed(phaseIds[0]!, "z9");

    const res = await move(x.id, { toPhaseId: phaseIds[0], afterId: a.id, beforeId: b.id }).expect(200);
    expect(res.body.data.rank > a.rank && res.body.data.rank < b.rank).toBe(true);
    expect(res.body.data.status).toBe("OPEN");
    expect(await movedEvents(x.id)).toBe(0); // §6.3: reorder не пишет событие
  });

  it("move в другую фазу: status синхронизируется, событие project.moved записано", async () => {
    const x = await seed(phaseIds[0]!, "a0");

    const res = await move(x.id, { toPhaseId: phaseIds[2] }).expect(200); // won (WON)
    expect(res.body.data.phaseId).toBe(phaseIds[2]);
    expect(res.body.data.status).toBe("WON");

    const events = await prisma.activityEvent.findMany({ where: { projectId: x.id, type: "project.moved" } });
    expect(events).toHaveLength(1);
    const payload = events[0]?.payload as { fromPhaseKey: string; toPhaseKey: string };
    expect(payload.fromPhaseKey).toBe("lead");
    expect(payload.toPhaseKey).toBe("won");
  });

  it("move в LOST-фазу → status LOST", async () => {
    const x = await seed(phaseIds[0]!, "a0");
    const res = await move(x.id, { toPhaseId: phaseIds[3] }).expect(200);
    expect(res.body.data.status).toBe("LOST");
  });

  it("без соседей → наверх целевой колонки (§4.1)", async () => {
    const top = await seed(phaseIds[1]!, "a0");
    const x = await seed(phaseIds[0]!, "a0");

    const res = await move(x.id, { toPhaseId: phaseIds[1] }).expect(200);
    expect(res.body.data.rank < top.rank).toBe(true); // выше текущего первого
  });

  describe("стейл-соседи и tenant → правильные коды", () => {
    it("перевёрнутая пара (after.rank >= before.rank) → 409 STALE_NEIGHBORS", async () => {
      const a = await seed(phaseIds[0]!, "a0");
      const b = await seed(phaseIds[0]!, "a2");
      const x = await seed(phaseIds[0]!, "z9");

      const res = await move(x.id, { toPhaseId: phaseIds[0], afterId: b.id, beforeId: a.id }).expect(409);
      expect(res.body.error.code).toBe("STALE_NEIGHBORS");
    });

    it("сосед из другой фазы → 409", async () => {
      const other = await seed(phaseIds[1]!, "a0"); // в фазе 1
      const x = await seed(phaseIds[0]!, "z9");
      await move(x.id, { toPhaseId: phaseIds[0], afterId: other.id }).expect(409);
    });

    it("несуществующий сосед → 404", async () => {
      const x = await seed(phaseIds[0]!, "z9");
      await move(x.id, { toPhaseId: phaseIds[0], afterId: "prj_nope" }).expect(404);
    });

    it("целевая фаза из другого воркспейса → 404", async () => {
      const other = await signUp(app);
      const otherWs = await request(app.getHttpServer())
        .post("/v1/workspaces")
        .set("Authorization", `Bearer ${other.token}`)
        .send({ name: "Other" })
        .expect(201);
      const foreignPhaseId = otherWs.body.data.phases[0].id;
      const x = await seed(phaseIds[0]!, "a0");
      await move(x.id, { toPhaseId: foreignPhaseId }).expect(404);
    });

    it("чужой проект → 404", async () => {
      const x = await seed(phaseIds[0]!, "a0");
      const stranger = await signUp(app);
      await request(app.getHttpServer())
        .post(`/v1/projects/${x.id}/move`)
        .set("Authorization", `Bearer ${stranger.token}`)
        .send({ toPhaseId: phaseIds[0] })
        .expect(404);
    });

    // Матрица «Move phases» Member△ → capability allow (scope=ORG в M1). Viewer — deny.
    it("MEMBER → 200 (move — capability allow)", async () => {
      const x = await seed(phaseIds[0]!, "a0");
      await prisma.membership.updateMany({ data: { role: "MEMBER" } });
      await move(x.id, { toPhaseId: phaseIds[1] }).expect(200);
    });

    it("VIEWER → 403", async () => {
      const x = await seed(phaseIds[0]!, "a0");
      await prisma.membership.updateMany({ data: { role: "VIEWER" } });
      await move(x.id, { toPhaseId: phaseIds[1] }).expect(403);
    });
  });

  it("рекомпакция при длинном ранге: порядок сохранён, длина упала (§4.4)", async () => {
    // Соседи с длинными смежными рангами → rankBetween > 32 → триггер рекомпакции.
    let lo = "a0";
    const hi = "a1";
    while (generateKeyBetween(lo, hi).length <= 32) lo = generateKeyBetween(lo, hi);
    const a = await seed(phaseIds[0]!, lo);
    const b = await seed(phaseIds[0]!, hi);
    const x = await seed(phaseIds[1]!, "a0");

    await move(x.id, { toPhaseId: phaseIds[0], afterId: a.id, beforeId: b.id }).expect(200);

    const col = await prisma.project.findMany({
      where: { phaseId: phaseIds[0] },
      orderBy: [{ rank: "asc" }, { id: "asc" }],
      select: { id: true, rank: true },
    });
    expect(col.map((p) => p.id)).toEqual([a.id, x.id, b.id]); // порядок сохранён
    expect(Math.max(...col.map((p) => p.rank.length))).toBeLessThanOrEqual(5); // длина упала
  });

  it("конкурентные move в одну фазу: оба успешны (advisory lock сериализует)", async () => {
    const x1 = await seed(phaseIds[0]!, "a0");
    const x2 = await seed(phaseIds[0]!, "a1");

    const [r1, r2] = await Promise.all([
      move(x1.id, { toPhaseId: phaseIds[1] }),
      move(x2.id, { toPhaseId: phaseIds[1] }),
    ]);
    expect([r1.status, r2.status]).toEqual([200, 200]);

    const inTarget = await prisma.project.count({ where: { phaseId: phaseIds[1] } });
    expect(inTarget).toBe(2);
  });
});
