import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@helix/db";
import { createTestApp } from "../helpers/create-test-app";

let counter = 0;

async function signUp(app: INestApplication): Promise<{ token: string; orgId: string; userId: string }> {
  const email = `kb${counter++}@example.com`;
  const res = await request(app.getHttpServer())
    .post("/v1/auth/register")
    .send({ email, name: "KB Author", password: "correct horse battery staple" })
    .expect(201);
  const token = res.body.data.accessToken as string;
  const claims = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString());
  return { token, orgId: claims.activeOrgId, userId: claims.sub };
}

describe("KBArticle (pages-kb.md)", () => {
  let app: INestApplication;
  let token: string;
  let userId: string;
  let workspaceId: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    const u = await signUp(app);
    token = u.token;
    userId = u.userId;
    workspaceId = (
      await request(app.getHttpServer())
        .post("/v1/workspaces")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Board" })
        .expect(201)
    ).body.data.id;
  });

  const create = (tok: string, body: object) =>
    request(app.getHttpServer()).post("/v1/kb-articles").set("Authorization", `Bearer ${tok}`).send(body);
  const list = (tok: string, qs = "") =>
    request(app.getHttpServer()).get(`/v1/kb-articles${qs}`).set("Authorization", `Bearer ${tok}`);
  const getOne = (id: string, tok: string) =>
    request(app.getHttpServer()).get(`/v1/kb-articles/${id}`).set("Authorization", `Bearer ${tok}`);
  const update = (id: string, tok: string, body: object) =>
    request(app.getHttpServer()).patch(`/v1/kb-articles/${id}`).set("Authorization", `Bearer ${tok}`).send(body);
  const del = (id: string, tok: string) =>
    request(app.getHttpServer()).delete(`/v1/kb-articles/${id}`).set("Authorization", `Bearer ${tok}`);

  describe("CRUD + tenant scope", () => {
    it("создаёт/читает/обновляет/удаляет org-wide статью (без workspaceId)", async () => {
      const created = await create(token, { title: "Onboarding", tags: ["hr"] }).expect(201);
      expect(created.body.data.workspaceId).toBeNull();

      const fetched = await getOne(created.body.data.id, token).expect(200);
      expect(fetched.body.data.title).toBe("Onboarding");

      const updated = await update(created.body.data.id, token, { title: "Onboarding v2" }).expect(200);
      expect(updated.body.data.title).toBe("Onboarding v2");

      await del(created.body.data.id, token).expect(200);
      await getOne(created.body.data.id, token).expect(404);
    });

    it("чужая орга → 404", async () => {
      const created = await create(token, { title: "Secret" }).expect(201);
      const stranger = await signUp(app);
      await getOne(created.body.data.id, stranger.token).expect(404);
      await update(created.body.data.id, stranger.token, { title: "x" }).expect(404);
      await del(created.body.data.id, stranger.token).expect(404);
    });
  });

  describe("RBAC (§4: Manager+ manage, Member △ create/read, no update/delete, Viewer read-only)", () => {
    it("Viewer → 403 на create", async () => {
      await prisma.membership.updateMany({ where: { userId }, data: { role: "VIEWER" } });
      await create(token, { title: "x" }).expect(403);
      await list(token).expect(200);
    });

    it("Member → может create/read, НЕ может update/delete", async () => {
      await prisma.membership.updateMany({ where: { userId }, data: { role: "MEMBER" } });
      const created = await create(token, { title: "Member article" }).expect(201);
      await update(created.body.data.id, token, { title: "x" }).expect(403);
      await del(created.body.data.id, token).expect(403);
    });

    it("Manager → может всё", async () => {
      await prisma.membership.updateMany({ where: { userId }, data: { role: "MANAGER" } });
      const created = await create(token, { title: "Managed" }).expect(201);
      await update(created.body.data.id, token, { title: "y" }).expect(200);
      await del(created.body.data.id, token).expect(200);
    });
  });

  describe("KB scope (§1/§7) — org-wide видна везде, per-workspace только в своём", () => {
    it("workspaceId=null видна с любым ?workspaceId= и без него", async () => {
      await create(token, { title: "Global" }).expect(201);
      const otherWorkspaceId = (
        await request(app.getHttpServer())
          .post("/v1/workspaces")
          .set("Authorization", `Bearer ${token}`)
          .send({ name: "Other" })
          .expect(201)
      ).body.data.id;

      const noParam = await list(token).expect(200);
      expect(noParam.body.data.map((a: { title: string }) => a.title)).toContain("Global");

      const withOther = await list(token, `?workspaceId=${otherWorkspaceId}`).expect(200);
      expect(withOther.body.data.map((a: { title: string }) => a.title)).toContain("Global");
    });

    it("workspaceId=X не видна при запросе workspaceId=Y", async () => {
      await create(token, { workspaceId, title: "Scoped to X" }).expect(201);
      const otherWorkspaceId = (
        await request(app.getHttpServer())
          .post("/v1/workspaces")
          .set("Authorization", `Bearer ${token}`)
          .send({ name: "Y" })
          .expect(201)
      ).body.data.id;

      const seenFromY = await list(token, `?workspaceId=${otherWorkspaceId}`).expect(200);
      expect(seenFromY.body.data.map((a: { title: string }) => a.title)).not.toContain("Scoped to X");

      const seenFromX = await list(token, `?workspaceId=${workspaceId}`).expect(200);
      expect(seenFromX.body.data.map((a: { title: string }) => a.title)).toContain("Scoped to X");
    });
  });

  describe("Полнотекстовый поиск (§7 пересмотрено — KBArticle.searchText, GIN по to_tsvector, тот же приём, что Pages)", () => {
    it("q= находит по совпадению в title", async () => {
      await create(token, { title: "Refund Policy" }).expect(201);
      await create(token, { title: "Shipping Guide" }).expect(201);

      const res = await list(token, "?q=refund").expect(200);
      expect(res.body.data.map((a: { title: string }) => a.title)).toEqual(["Refund Policy"]);
    });

    it("q= находит по совпадению внутри content, не только title", async () => {
      await create(token, {
        title: "Meeting notes",
        content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "budget approval process" }] }] },
      }).expect(201);
      await create(token, { title: "Другая статья" }).expect(201);

      const res = await list(token, "?q=budget").expect(200);
      expect(res.body.data.map((a: { title: string }) => a.title)).toEqual(["Meeting notes"]);
    });

    it("q= находит по неполному слову (префиксный поиск, не строгое совпадение)", async () => {
      await create(token, { title: "Тест жирного текста" }).expect(201);
      await create(token, { title: "Другая статья" }).expect(201);

      const res = await list(token, `?q=${encodeURIComponent("жирн")}`).expect(200);
      expect(res.body.data.map((a: { title: string }) => a.title)).toEqual(["Тест жирного текста"]);
    });

    it("обновление content пересчитывает searchText — старый текст больше не находится, новый находится", async () => {
      const created = await create(token, {
        title: "Doc",
        content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "oldword" }] }] },
      }).expect(201);

      expect((await list(token, "?q=oldword").expect(200)).body.data).toHaveLength(1);

      await update(created.body.data.id, token, {
        content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "newword" }] }] },
      }).expect(200);

      expect((await list(token, "?q=oldword").expect(200)).body.data).toHaveLength(0);
      expect((await list(token, "?q=newword").expect(200)).body.data).toHaveLength(1);
    });

    it("tag= матчит только точное вхождение тега", async () => {
      await create(token, { title: "Tagged A", tags: ["billing", "faq"] }).expect(201);
      await create(token, { title: "Tagged B", tags: ["shipping"] }).expect(201);

      const res = await list(token, "?tag=billing").expect(200);
      expect(res.body.data.map((a: { title: string }) => a.title)).toEqual(["Tagged A"]);
    });
  });

  describe("icon + authorName", () => {
    it("icon сохраняется и обновляется; authorName — имя создателя (live join, не снапшот)", async () => {
      const created = await create(token, { title: "With icon", icon: "📚" }).expect(201);
      expect(created.body.data.icon).toBe("📚");
      expect(created.body.data.authorName).toBe("KB Author");

      const cleared = await update(created.body.data.id, token, { icon: null }).expect(200);
      expect(cleared.body.data.icon).toBeNull();
    });
  });

  describe("GIN-индекс на tags реально используется (§1/§10)", () => {
    it("EXPLAIN на `tags @> ARRAY[...]` показывает Index/Bitmap Scan, не Seq Scan", async () => {
      const created = await create(token, { title: "Indexed", tags: ["needle"] }).expect(201);
      const claims = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString());

      // Таблица в тесте — единицы строк: планировщик Postgres на такой малой таблице почти всегда
      // предпочтёт Seq Scan независимо от индекса (тот же эффект, что EXPLAIN на RefreshSession
      // при синтетическом объёме в прошлой сессии — селективность/размер решают, не факт наличия
      // индекса). `enable_seqscan=off` — стандартный приём проверить, что синтаксис индекса (§1
      // врезка: голый `@@index([tags], type: Gin)` без `ops: ArrayOps`) физически СПОСОБЕН
      // обслужить `@>`-запрос, а не что планировщик выбрал бы его на реальном объёме.
      const plan = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL enable_seqscan = off");
        return tx.$queryRaw<{ "QUERY PLAN": string }[]>`
          EXPLAIN SELECT * FROM "KBArticle"
          WHERE "orgId" = ${claims.activeOrgId} AND "tags" @> ARRAY['needle']::text[]
        `;
      });
      const planText = plan.map((r) => r["QUERY PLAN"]).join("\n");
      expect(planText).toMatch(/Index Scan|Bitmap Index Scan/);
      expect(created.body.data.tags).toEqual(["needle"]);
    });
  });
});
