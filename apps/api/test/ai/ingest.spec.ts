import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@helix/db";
import { createTestApp } from "../helpers/create-test-app";
import { MockAiProviderService } from "../helpers/mock-ai-provider";
import { AiProviderService } from "../../src/modules/ai/ai-provider.service";

let counter = 0;

async function signUpWithProject(app: INestApplication): Promise<{ token: string; projectId: string }> {
  const email = `ingest${counter++}@example.com`;
  const registerRes = await request(app.getHttpServer())
    .post("/v1/auth/register")
    .send({ email, name: "Ingest Tester", password: "correct horse battery staple" })
    .expect(201);
  const token = registerRes.body.data.accessToken as string;

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

  return { token, projectId: project.body.data.id };
}

async function waitForChunks(sourceId: string, minCount: number, timeoutMs = 5000): Promise<number> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const count = await prisma.embeddingChunk.count({ where: { sourceId } });
    if (count >= minCount) return count;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Timed out waiting for ${minCount} EmbeddingChunk row(s) for source ${sourceId}`);
}

// ai-chat.md §10 integration: "Page.update() → EmbeddingChunk строки созданы с правильным
// orgId/projectId" + "повторный update() заменяет чанки, не дублирует". Реальный BullMQ (Redis) —
// ничего не мокается на уровне очереди/воркера (тот же принцип, что lead-created-trigger.spec.ts
// для email); мокается ТОЛЬКО эмбеддинг-провайдер (§10: "не тестируем реальные ответы провайдеров").
describe("Ingest pipeline — Page.create/update → EmbeddingChunk (ai-chat.md §3)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp((builder) => builder.overrideProvider(AiProviderService).useClass(MockAiProviderService));
  });

  afterAll(async () => {
    await app.close();
  });

  it("создание Page с контентом ставит EmbeddingChunk с правильным orgId/projectId", async () => {
    const { token, projectId } = await signUpWithProject(app);
    const created = await request(app.getHttpServer())
      .post(`/v1/projects/${projectId}/pages`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Onboarding",
        content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Step one: say hello." }] }] },
      })
      .expect(201);
    const pageId = created.body.data.id as string;

    await waitForChunks(pageId, 1);
    const rows = await prisma.embeddingChunk.findMany({ where: { sourceId: pageId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.sourceType).toBe("PAGE");
    expect(rows[0]!.projectId).toBe(projectId);
    expect(rows[0]!.content).toContain("Step one: say hello");
  });

  it("повторный update() заменяет старые чанки, не накапливает дубли", async () => {
    const { token, projectId } = await signUpWithProject(app);
    const created = await request(app.getHttpServer())
      .post(`/v1/projects/${projectId}/pages`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Draft", content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "version one" }] }] } })
      .expect(201);
    const pageId = created.body.data.id as string;
    await waitForChunks(pageId, 1);

    await request(app.getHttpServer())
      .patch(`/v1/pages/${pageId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "version two, totally different" }] }] } })
      .expect(200);

    // Ждём, что содержимое переехало на новое — не просто "ещё одна строка появилась".
    const start = Date.now();
    let rows: Awaited<ReturnType<typeof prisma.embeddingChunk.findMany>> = [];
    while (Date.now() - start < 5000) {
      rows = await prisma.embeddingChunk.findMany({ where: { sourceId: pageId } });
      if (rows.some((r) => r.content.includes("version two"))) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(rows).toHaveLength(1); // не 2 — старый чанк удалён, не оставлен рядом с новым
    expect(rows[0]!.content).toContain("version two, totally different");
    expect(rows[0]!.content).not.toContain("version one");
  });

  it("удаление Page чистит её EmbeddingChunk-строки (§1.1: P2 не применяется к чанкам)", async () => {
    const { token, projectId } = await signUpWithProject(app);
    const created = await request(app.getHttpServer())
      .post(`/v1/projects/${projectId}/pages`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "To delete", content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "will be removed" }] }] } })
      .expect(201);
    const pageId = created.body.data.id as string;
    await waitForChunks(pageId, 1);

    await request(app.getHttpServer()).delete(`/v1/pages/${pageId}`).set("Authorization", `Bearer ${token}`).expect(200);

    const rows = await prisma.embeddingChunk.findMany({ where: { sourceId: pageId } });
    expect(rows).toHaveLength(0);
  });
});
