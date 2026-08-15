import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp } from "../helpers/create-test-app";
import { EmbeddingChunkRepository } from "../../src/modules/ai/embedding-chunk.repository";

let counter = 0;

async function signUpWithProject(
  app: INestApplication,
): Promise<{ token: string; orgId: string; projectId: string; workspaceId: string }> {
  const email = `retr${counter++}@example.com`;
  const registerRes = await request(app.getHttpServer())
    .post("/v1/auth/register")
    .send({ email, name: "Retrieval Tester", password: "correct horse battery staple" })
    .expect(201);
  const token = registerRes.body.data.accessToken as string;
  const claims = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString());

  const ws = await request(app.getHttpServer())
    .post("/v1/workspaces")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "Board" })
    .expect(201);
  const project = await request(app.getHttpServer())
    .post(`/v1/workspaces/${ws.body.data.id}/projects`)
    .set("Authorization", `Bearer ${token}`)
    .send({ title: "Lead" })
    .expect(201);

  return { token, orgId: claims.activeOrgId, projectId: project.body.data.id, workspaceId: ws.body.data.id };
}

const QUERY_VECTOR = Array<number>(1536).fill(0.01);

// ai-chat.md §10, integration, приоритет #1: "orgId A задаёт вопрос → retrieval никогда не
// возвращает чанки orgId B, даже если построить контент специально похожим". EmbeddingChunk не
// имеет composite-FK backbone на Project (§2 ai-chat.md) — единственная гарантия тенант-изоляции
// здесь — явный orgId в WHERE каждого retrieval-запроса, поэтому проверяем именно SQL-фильтр
// (EmbeddingChunkRepository.searchProjectScope), а не мокаем его.
describe("EmbeddingChunkRepository.searchProjectScope — tenant isolation (ai-chat.md §2/§10)", () => {
  let app: INestApplication;
  let chunks: EmbeddingChunkRepository;

  beforeAll(async () => {
    app = await createTestApp();
    chunks = app.get(EmbeddingChunkRepository);
  });

  afterAll(async () => {
    await app.close();
  });

  it("не возвращает чанки чужой орги, даже с идентичным содержимым", async () => {
    const orgA = await signUpWithProject(app);
    const orgB = await signUpWithProject(app);

    await chunks.createMany([
      {
        orgId: orgA.orgId,
        projectId: orgA.projectId,
        workspaceId: orgA.workspaceId,
        sourceType: "PAGE",
        sourceId: "page-a",
        chunkIndex: 0,
        content: "Confidential roadmap",
        embedding: QUERY_VECTOR,
      },
    ]);
    await chunks.createMany([
      {
        orgId: orgB.orgId,
        projectId: orgB.projectId,
        workspaceId: orgB.workspaceId,
        sourceType: "PAGE",
        sourceId: "page-b",
        chunkIndex: 0,
        content: "Confidential roadmap", // намеренно тот же текст — только orgId различает
        embedding: QUERY_VECTOR,
      },
    ]);

    const resultsForA = await chunks.searchProjectScope(orgA.orgId, orgA.projectId, orgA.workspaceId, QUERY_VECTOR, 10);
    expect(resultsForA.map((c) => c.sourceId)).toEqual(["page-a"]);

    const resultsForB = await chunks.searchProjectScope(orgB.orgId, orgB.projectId, orgB.workspaceId, QUERY_VECTOR, 10);
    expect(resultsForB.map((c) => c.sourceId)).toEqual(["page-b"]);
  });

  it("org-wide KB (workspaceId IS NULL) виден только внутри СВОЕЙ орги — orgId-фильтр применяется даже к branch'у с NULL", async () => {
    const orgA = await signUpWithProject(app);
    const orgB = await signUpWithProject(app);

    await chunks.createMany([
      {
        orgId: orgA.orgId,
        projectId: null,
        workspaceId: null, // org-wide KB
        sourceType: "KB_ARTICLE",
        sourceId: "kb-a",
        chunkIndex: 0,
        content: "How we handle refunds",
        embedding: QUERY_VECTOR,
      },
      {
        orgId: orgB.orgId,
        projectId: null,
        workspaceId: null, // тоже org-wide KB, но ДРУГОЙ орги
        sourceType: "KB_ARTICLE",
        sourceId: "kb-b",
        chunkIndex: 0,
        content: "How we handle refunds",
        embedding: QUERY_VECTOR,
      },
    ]);

    const resultsForA = await chunks.searchProjectScope(orgA.orgId, orgA.projectId, orgA.workspaceId, QUERY_VECTOR, 10);
    expect(resultsForA.map((c) => c.sourceId)).toEqual(["kb-a"]);
  });

  it("Page-чанки видны только для СВОЕГО projectId, не соседнего проекта той же орги/воркспейса", async () => {
    const org = await signUpWithProject(app);
    const siblingProject = await request(app.getHttpServer())
      .post(`/v1/workspaces/${org.workspaceId}/projects`)
      .set("Authorization", `Bearer ${org.token}`)
      .send({ title: "Sibling lead" })
      .expect(201);

    await chunks.createMany([
      {
        orgId: org.orgId,
        projectId: org.projectId,
        workspaceId: org.workspaceId,
        sourceType: "PAGE",
        sourceId: "page-own",
        chunkIndex: 0,
        content: "own project page",
        embedding: QUERY_VECTOR,
      },
      {
        orgId: org.orgId,
        projectId: siblingProject.body.data.id,
        workspaceId: org.workspaceId,
        sourceType: "PAGE",
        sourceId: "page-sibling",
        chunkIndex: 0,
        content: "sibling project page",
        embedding: QUERY_VECTOR,
      },
    ]);

    const results = await chunks.searchProjectScope(org.orgId, org.projectId, org.workspaceId, QUERY_VECTOR, 10);
    expect(results.map((c) => c.sourceId)).toEqual(["page-own"]);
  });

  it("KB_ARTICLE, привязанная к КОНКРЕТНОМУ workspaceId (не org-wide), не видна проектам ДРУГОГО воркспейса той же орги", async () => {
    const org = await signUpWithProject(app);
    const otherWorkspace = await request(app.getHttpServer())
      .post("/v1/workspaces")
      .set("Authorization", `Bearer ${org.token}`)
      .send({ name: "Other board" })
      .expect(201);

    await chunks.createMany([
      {
        orgId: org.orgId,
        projectId: null,
        workspaceId: otherWorkspace.body.data.id, // KB другого воркспейса ТОЙ ЖЕ орги
        sourceType: "KB_ARTICLE",
        sourceId: "kb-other-ws",
        chunkIndex: 0,
        content: "scoped to a different workspace",
        embedding: QUERY_VECTOR,
      },
    ]);

    const results = await chunks.searchProjectScope(org.orgId, org.projectId, org.workspaceId, QUERY_VECTOR, 10);
    expect(results.map((c) => c.sourceId)).not.toContain("kb-other-ws");
  });
});
