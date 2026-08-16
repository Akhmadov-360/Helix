import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, type Prisma } from "@helix/db";
import { createTestApp } from "../helpers/create-test-app";
import { MockAiProviderService, MockChatProvider } from "../helpers/mock-ai-provider";
import { AiProviderService } from "../../src/modules/ai/ai-provider.service";

let counter = 0;

interface Session {
  token: string;
  orgId: string;
  userId: string;
  projectId: string;
  workspaceId: string;
}

async function signUpWithProject(app: INestApplication): Promise<Session> {
  const email = `thread${counter++}@example.com`;
  const registerRes = await request(app.getHttpServer())
    .post("/v1/auth/register")
    .send({ email, name: "Thread Tester", password: "correct horse battery staple" })
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

  return { token, orgId: claims.activeOrgId, userId: claims.sub, projectId: project.body.data.id, workspaceId: ws.body.data.id };
}

async function createThread(app: INestApplication, session: Session): Promise<string> {
  const res = await request(app.getHttpServer())
    .post(`/v1/projects/${session.projectId}/ai-threads`)
    .set("Authorization", `Bearer ${session.token}`)
    .expect(201);
  return res.body.data.id as string;
}

// postMessage пишет вручную в text/event-stream (ai-chat.md §4) — Express-статус по умолчанию 200
// (res.status() ни разу не вызван), тело — конкатенация "data: {...}\n\n" блоков.
function parseSseEvents(raw: string): Array<Record<string, unknown>> {
  return raw
    .split("\n\n")
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => JSON.parse(block.replace(/^data: /, "")) as Record<string, unknown>);
}

async function seedProposedToolCall(
  threadId: string,
  callId: string,
  tool: string,
  args: Record<string, unknown>,
): Promise<string> {
  const message = await prisma.message.create({
    data: {
      threadId,
      role: "ASSISTANT",
      content: "Proposed action.",
      toolCalls: [{ id: callId, tool, args, status: "PROPOSED" }] as unknown as Prisma.InputJsonValue,
    },
  });
  return message.id;
}

describe("AiThreadsController (ai-chat.md §4/§6/§8)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp((builder) => builder.overrideProvider(AiProviderService).useClass(MockAiProviderService));
  });

  afterAll(async () => {
    await app.close();
  });

  describe("Thread CRUD + tenant scope", () => {
    it("создаёт тред, отдаёт его в списке проекта, удаляет", async () => {
      const session = await signUpWithProject(app);
      const threadId = await createThread(app, session);

      const listed = await request(app.getHttpServer())
        .get(`/v1/projects/${session.projectId}/ai-threads`)
        .set("Authorization", `Bearer ${session.token}`)
        .expect(200);
      expect(listed.body.data.map((t: { id: string }) => t.id)).toContain(threadId);

      await request(app.getHttpServer())
        .delete(`/v1/ai-threads/${threadId}`)
        .set("Authorization", `Bearer ${session.token}`)
        .expect(200);
    });

    it("чужая орга → 404 на создание/список/сообщения/удаление", async () => {
      const session = await signUpWithProject(app);
      const threadId = await createThread(app, session);
      const stranger = await signUpWithProject(app);

      await request(app.getHttpServer())
        .post(`/v1/projects/${session.projectId}/ai-threads`)
        .set("Authorization", `Bearer ${stranger.token}`)
        .expect(404);
      await request(app.getHttpServer())
        .get(`/v1/projects/${session.projectId}/ai-threads`)
        .set("Authorization", `Bearer ${stranger.token}`)
        .expect(404);
      await request(app.getHttpServer())
        .get(`/v1/ai-threads/${threadId}/messages`)
        .set("Authorization", `Bearer ${stranger.token}`)
        .expect(404);
      await request(app.getHttpServer())
        .delete(`/v1/ai-threads/${threadId}`)
        .set("Authorization", `Bearer ${stranger.token}`)
        .expect(404);
    });

    it("удаление: автор может удалить свой; посторонний Member — нет; Manager — может любой", async () => {
      const session = await signUpWithProject(app);
      const threadId = await createThread(app, session);

      const memberEmail = `threadmember${counter++}@example.com`;
      const memberRes = await request(app.getHttpServer())
        .post("/v1/auth/register")
        .send({ email: memberEmail, name: "Colleague", password: "correct horse battery staple" })
        .expect(201);
      const memberClaims = JSON.parse(Buffer.from((memberRes.body.data.accessToken as string).split(".")[1] ?? "", "base64url").toString());
      await prisma.membership.create({ data: { orgId: session.orgId, userId: memberClaims.sub, role: "MEMBER" } });
      const memberSwitch = await request(app.getHttpServer())
        .post("/v1/auth/switch-org")
        .set("Authorization", `Bearer ${memberRes.body.data.accessToken}`)
        .send({ orgId: session.orgId })
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/v1/ai-threads/${threadId}`)
        .set("Authorization", `Bearer ${memberSwitch.body.data.accessToken}`)
        .expect(403);

      await prisma.membership.updateMany({ where: { userId: memberClaims.sub, orgId: session.orgId }, data: { role: "MANAGER" } });
      const managerSwitch = await request(app.getHttpServer())
        .post("/v1/auth/switch-org")
        .set("Authorization", `Bearer ${memberRes.body.data.accessToken}`)
        .send({ orgId: session.orgId })
        .expect(200);
      await request(app.getHttpServer())
        .delete(`/v1/ai-threads/${threadId}`)
        .set("Authorization", `Bearer ${managerSwitch.body.data.accessToken}`)
        .expect(200);
    });
  });

  describe("SSE query pipeline (§4)", () => {
    it("токены приходят по порядку, финальный Message сохраняется с citations", async () => {
      const session = await signUpWithProject(app);
      const page = await request(app.getHttpServer())
        .post(`/v1/projects/${session.projectId}/pages`)
        .set("Authorization", `Bearer ${session.token}`)
        .send({ title: "Runbook", content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Escalate to on-call" }] }] } })
        .expect(201);

      // Дождаться ingest, иначе retrieval пустой (chunk ещё не проиндексирован).
      const start = Date.now();
      while (Date.now() - start < 5000) {
        const count = await prisma.embeddingChunk.count({ where: { sourceId: page.body.data.id } });
        if (count > 0) break;
        await new Promise((r) => setTimeout(r, 100));
      }

      const threadId = await createThread(app, session);
      MockChatProvider.script = [{ type: "text_delta", text: "Escalate " }, { type: "text_delta", text: "to on-call." }, { type: "done" }];

      const res = await request(app.getHttpServer())
        .post(`/v1/ai-threads/${threadId}/messages`)
        .set("Authorization", `Bearer ${session.token}`)
        .send({ content: "What should I do?" })
        .expect(201); // @Res() без passthrough — Nest всё равно проставляет дефолтный POST-статус до handler'а

      const events = parseSseEvents(res.text);
      expect(events.map((e) => e.type)).toEqual(["text_delta", "text_delta", "done", "message_saved"]);
      expect(events[0]).toMatchObject({ type: "text_delta", text: "Escalate " });
      expect(events[1]).toMatchObject({ type: "text_delta", text: "to on-call." });

      const saved = events[3]!.message as { content: string; citations: unknown[]; role: string };
      expect(saved.role).toBe("ASSISTANT");
      expect(saved.content).toBe("Escalate to on-call.");
      expect(saved.citations.length).toBeGreaterThan(0);

      const history = await request(app.getHttpServer())
        .get(`/v1/ai-threads/${threadId}/messages`)
        .set("Authorization", `Bearer ${session.token}`)
        .expect(200);
      expect(history.body.data.map((m: { role: string; content: string }) => [m.role, m.content])).toEqual([
        ["USER", "What should I do?"],
        ["ASSISTANT", "Escalate to on-call."],
      ]);
    });

    it("провайдер не настроен (org без ключа) → 422 ДО открытия SSE-потока, без сохранённого USER-сообщения", async () => {
      // Отдельное приложение БЕЗ override — реальный AiProviderService видит org без aiProvider
      // в settings и БЕЗ ключей в env этого тестового процесса → ProviderNotConfiguredError.
      const realApp = await createTestApp();
      try {
        const session = await signUpWithProject(realApp);
        const threadId = await createThread(realApp, session);

        const res = await request(realApp.getHttpServer())
          .post(`/v1/ai-threads/${threadId}/messages`)
          .set("Authorization", `Bearer ${session.token}`)
          .send({ content: "Hello?" })
          .expect(422);
        expect(res.body.error.code).toBe("AI_PROVIDER_NOT_CONFIGURED");

        const history = await request(realApp.getHttpServer())
          .get(`/v1/ai-threads/${threadId}/messages`)
          .set("Authorization", `Bearer ${session.token}`)
          .expect(200);
        expect(history.body.data).toEqual([]);
      } finally {
        await realApp.close();
      }
    });

    it("read-only инструмент (draft_email) помечается EXECUTED сразу, без ожидания confirm (§6)", async () => {
      const session = await signUpWithProject(app);
      const threadId = await createThread(app, session);
      MockChatProvider.script = [
        { type: "tool_call_proposed", id: "call_draft", tool: "draft_email", args: { subject: "Follow up", body: "Hi there" } },
        { type: "done" },
      ];

      const res = await request(app.getHttpServer())
        .post(`/v1/ai-threads/${threadId}/messages`)
        .set("Authorization", `Bearer ${session.token}`)
        .send({ content: "Draft a follow-up email" })
        .expect(201);

      const events = parseSseEvents(res.text);
      const saved = events.find((e) => e.type === "message_saved")!.message as { toolCalls: Array<{ tool: string; status: string }> };
      expect(saved.toolCalls).toHaveLength(1);
      expect(saved.toolCalls[0]).toMatchObject({ tool: "draft_email", status: "EXECUTED" });
    });
  });

  describe("Tool-call confirm/reject (§6)", () => {
    it("PROPOSED → confirm → EXECUTED, ActivityEvent записан с actorId подтвердившего (не ассистента)", async () => {
      const session = await signUpWithProject(app);
      const threadId = await createThread(app, session);
      const board = await request(app.getHttpServer())
        .get(`/v1/workspaces/${session.workspaceId}/board`)
        .set("Authorization", `Bearer ${session.token}`)
        .expect(200);
      const targetPhaseId = board.body.data.phases[1].id as string;
      await seedProposedToolCall(threadId, "call_move", "move_phase", { toPhaseId: targetPhaseId });

      const res = await request(app.getHttpServer())
        .post(`/v1/ai-threads/${threadId}/tool-calls/call_move/confirm`)
        .set("Authorization", `Bearer ${session.token}`)
        .expect(201);
      const toolCall = res.body.data.toolCalls.find((tc: { id: string }) => tc.id === "call_move");
      expect(toolCall.status).toBe("EXECUTED");
      expect(toolCall.result.phaseId).toBe(targetPhaseId);

      const project = await prisma.project.findUniqueOrThrow({ where: { id: session.projectId } });
      expect(project.phaseId).toBe(targetPhaseId);

      const event = await prisma.activityEvent.findFirst({
        where: { projectId: session.projectId, type: "project.moved" },
        orderBy: { createdAt: "desc" },
      });
      expect(event?.actorId).toBe(session.userId); // актор подтверждения, не ассистент
    });

    it("двойной confirm на один callId → второй 409 (не оставляет toolCall PROPOSED)", async () => {
      const session = await signUpWithProject(app);
      const threadId = await createThread(app, session);
      const board = await request(app.getHttpServer())
        .get(`/v1/workspaces/${session.workspaceId}/board`)
        .set("Authorization", `Bearer ${session.token}`)
        .expect(200);
      const targetPhaseId = board.body.data.phases[1].id as string;
      await seedProposedToolCall(threadId, "call_double", "move_phase", { toPhaseId: targetPhaseId });

      await request(app.getHttpServer())
        .post(`/v1/ai-threads/${threadId}/tool-calls/call_double/confirm`)
        .set("Authorization", `Bearer ${session.token}`)
        .expect(201);
      const second = await request(app.getHttpServer())
        .post(`/v1/ai-threads/${threadId}/tool-calls/call_double/confirm`)
        .set("Authorization", `Bearer ${session.token}`)
        .expect(409);
      expect(second.body.error.code).toBe("TOOL_CALL_NOT_PENDING");
    });

    it("конкурентный confirm на ОДИН callId — ровно один исполняется, ровно один task создан (code review — check-then-act race)", async () => {
      const session = await signUpWithProject(app);
      const threadId = await createThread(app, session);
      await seedProposedToolCall(threadId, "call_race", "create_task", { title: "Race safety task" });

      const [r1, r2] = await Promise.all([
        request(app.getHttpServer())
          .post(`/v1/ai-threads/${threadId}/tool-calls/call_race/confirm`)
          .set("Authorization", `Bearer ${session.token}`),
        request(app.getHttpServer())
          .post(`/v1/ai-threads/${threadId}/tool-calls/call_race/confirm`)
          .set("Authorization", `Bearer ${session.token}`),
      ]);
      const statuses = [r1.status, r2.status].sort();
      expect(statuses).toEqual([201, 409]);

      const tasks = await prisma.task.findMany({ where: { projectId: session.projectId, title: "Race safety task" } });
      expect(tasks).toHaveLength(1);
    });

    it("Member без права update Project → confirm move_phase = 403, toolCall остаётся PROPOSED (можно повторить с нужной ролью)", async () => {
      const session = await signUpWithProject(app);
      await prisma.membership.updateMany({ where: { userId: session.userId, orgId: session.orgId }, data: { role: "VIEWER" } });
      const threadId = await createThread(app, session);
      const board = await request(app.getHttpServer())
        .get(`/v1/workspaces/${session.workspaceId}/board`)
        .set("Authorization", `Bearer ${session.token}`)
        .expect(200);
      const targetPhaseId = board.body.data.phases[1].id as string;
      await seedProposedToolCall(threadId, "call_forbidden", "move_phase", { toPhaseId: targetPhaseId });

      const res = await request(app.getHttpServer())
        .post(`/v1/ai-threads/${threadId}/tool-calls/call_forbidden/confirm`)
        .set("Authorization", `Bearer ${session.token}`)
        .expect(403);
      expect(res.body.error.code).toBe("FORBIDDEN");

      // Роль повышена → тот же callId снова confirmable (не "сожжён" отказом).
      await prisma.membership.updateMany({ where: { userId: session.userId, orgId: session.orgId }, data: { role: "MANAGER" } });
      await request(app.getHttpServer())
        .post(`/v1/ai-threads/${threadId}/tool-calls/call_forbidden/confirm`)
        .set("Authorization", `Bearer ${session.token}`)
        .expect(201);
    });

    it("reject не требует CASL, переводит в REJECTED, повторный confirm после reject → 409", async () => {
      const session = await signUpWithProject(app);
      await prisma.membership.updateMany({ where: { userId: session.userId, orgId: session.orgId }, data: { role: "VIEWER" } });
      const threadId = await createThread(app, session);
      await seedProposedToolCall(threadId, "call_reject", "create_task", { title: "Rejected task" });

      const res = await request(app.getHttpServer())
        .post(`/v1/ai-threads/${threadId}/tool-calls/call_reject/reject`)
        .set("Authorization", `Bearer ${session.token}`)
        .expect(201);
      const toolCall = res.body.data.toolCalls.find((tc: { id: string }) => tc.id === "call_reject");
      expect(toolCall.status).toBe("REJECTED");

      await request(app.getHttpServer())
        .post(`/v1/ai-threads/${threadId}/tool-calls/call_reject/confirm`)
        .set("Authorization", `Bearer ${session.token}`)
        .expect(409);

      const tasks = await prisma.task.findMany({ where: { projectId: session.projectId, title: "Rejected task" } });
      expect(tasks).toHaveLength(0);
    });

    it("гонка состояния — фаза удалена между propose и confirm → 409, toolCall помечен REJECTED", async () => {
      const session = await signUpWithProject(app);
      const threadId = await createThread(app, session);
      await seedProposedToolCall(threadId, "call_stale", "move_phase", { toPhaseId: "does-not-exist-anymore" });

      const res = await request(app.getHttpServer())
        .post(`/v1/ai-threads/${threadId}/tool-calls/call_stale/confirm`)
        .set("Authorization", `Bearer ${session.token}`)
        .expect(409);
      expect(res.body.error.code).toBe("TOOL_CALL_NOT_PENDING");

      const history = await request(app.getHttpServer())
        .get(`/v1/ai-threads/${threadId}/messages`)
        .set("Authorization", `Bearer ${session.token}`)
        .expect(200);
      const toolCall = history.body.data
        .flatMap((m: { toolCalls: Array<{ id: string }> | null }) => m.toolCalls ?? [])
        .find((tc: { id: string }) => tc.id === "call_stale");
      expect(toolCall.status).toBe("REJECTED");
    });

    it("несуществующий callId → 404", async () => {
      const session = await signUpWithProject(app);
      const threadId = await createThread(app, session);
      await request(app.getHttpServer())
        .post(`/v1/ai-threads/${threadId}/tool-calls/does-not-exist/confirm`)
        .set("Authorization", `Bearer ${session.token}`)
        .expect(404);
    });

    // ai-chat.md §10 unit-пункт "невалидные аргументы отклоняются до вызова сервиса" — здесь как
    // integration: ToolCallExecutor не доверяет тому, что прислал LLM, ре-валидирует Zod-схемой
    // самого инструмента (tool-call-executor.ts). Проверяем эффект, не тип ошибки: PATCH не должен
    // случиться, даже если бы args'ы прошли достаточно далеко, чтобы что-то похожее на toPhaseId попытаться использовать.
    it("невалидные args (move_phase без toPhaseId) — фаза проекта НЕ меняется, confirm не 2xx", async () => {
      const session = await signUpWithProject(app);
      const threadId = await createThread(app, session);
      const before = await prisma.project.findUniqueOrThrow({ where: { id: session.projectId } });
      await seedProposedToolCall(threadId, "call_invalid", "move_phase", { toPhaseId: 12345 as unknown as string });

      const res = await request(app.getHttpServer())
        .post(`/v1/ai-threads/${threadId}/tool-calls/call_invalid/confirm`)
        .set("Authorization", `Bearer ${session.token}`);
      expect(res.status).toBeGreaterThanOrEqual(400);

      const after = await prisma.project.findUniqueOrThrow({ where: { id: session.projectId } });
      expect(after.phaseId).toBe(before.phaseId); // ничего не исполнилось
    });
  });
});
