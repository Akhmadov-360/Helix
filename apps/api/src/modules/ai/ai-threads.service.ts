import { Injectable, Logger } from "@nestjs/common";
import type {
  AiMessageListResponse,
  AiMessageResponse,
  AiStreamEvent,
  AiThreadListResponse,
  AiThreadResponse,
  Citation,
  CreateAiMessageInput,
  ToolCall,
  ToolCallStatus,
  ToolName,
} from "@helix/api-schemas";
import type { ChatMessage, ChatStreamEvent } from "@helix/ai";
import type { Prisma, Role } from "@helix/db";
import {
  ConflictError,
  ForbiddenActionError,
  ResourceNotFoundError,
  ToolCallNotPendingError,
} from "../../core/errors/domain-error";
import { roleRank } from "@helix/api-schemas";
import { defineAbilityForRole } from "../../core/authz/app-ability";
import { ActivityRepository } from "../activity/activity.repository";
import { PrismaService } from "../../core/prisma/prisma.service";
import { ProjectsRepository } from "../projects/projects.repository";
import type { ProjectRow } from "../projects/project.mapper";
import { AiProviderService } from "./ai-provider.service";
import { toAiMessageResponse, toAiThreadResponse } from "./ai-thread.mapper";
import { AiThreadsRepository, type MessageRow } from "./ai-threads.repository";
import { EmbeddingChunkRepository, type RetrievedChunk } from "./embedding-chunk.repository";
import { ToolCallExecutor } from "./tool-call-executor";
import { READ_ONLY_TOOL_NAMES, TOOL_POLICY, buildToolPermissionNotes, buildToolSchemas } from "./tool-schema";

// ai-chat.md §4: top-K=8.
const RETRIEVAL_TOP_K = 8;
// Ограничивает объём истории, идущей в промпт — не архитектурная граница домена (Message-строк
// в БД остаётся сколько угодно), просто не даём треду с сотнями сообщений раздувать каждый запрос.
const HISTORY_MESSAGE_LIMIT = 20;
// Число уникальных источников, попадающих в citations финального ответа (§1.3: citations —
// снапшот того, что видел юзер, не обязано перечислять все top-K чанков, если несколько — из
// одного источника).
const MAX_CITATIONS = 5;

export interface ChatSession {
  threadId: string;
  messages: ChatMessage[];
  citations: Citation[];
  streamChat: (params: { messages: ChatMessage[]; tools: ReturnType<typeof buildToolSchemas> }) => AsyncIterable<ChatStreamEvent>;
}

// §13.5 apps/web — wire-формат этого эндпоинта живёт как Zod-схема в api-schemas (aiStreamEventSchema),
// не только TS-тип здесь: apps/web парсит "data: {...}\n\n" блоки той же схемой (§6.2 apps/web —
// граница доверия = сеть). AiStreamEvent = @helix/api-schemas type alias для этого union.
export type AiWireEvent = AiStreamEvent;

@Injectable()
export class AiThreadsService {
  private readonly logger = new Logger(AiThreadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly threads: AiThreadsRepository,
    private readonly projects: ProjectsRepository,
    private readonly activityLog: ActivityRepository,
    private readonly chunks: EmbeddingChunkRepository,
    private readonly aiProvider: AiProviderService,
    private readonly executor: ToolCallExecutor,
  ) {}

  async createThread(orgId: string, projectId: string, userId: string): Promise<AiThreadResponse> {
    const project = await this.projects.findByIdInOrg(projectId, orgId);
    if (!project) throw new ResourceNotFoundError("Project not found");

    const row = await this.threads.createThread({
      orgId,
      scope: "PROJECT",
      projectId,
      workspaceId: project.workspaceId,
      createdById: userId,
    });
    return toAiThreadResponse(row);
  }

  async listThreads(orgId: string, projectId: string): Promise<AiThreadListResponse> {
    const project = await this.projects.findByIdInOrg(projectId, orgId);
    if (!project) throw new ResourceNotFoundError("Project not found");

    const rows = await this.threads.listByProject(projectId);
    return rows.map(toAiThreadResponse);
  }

  async listMessages(orgId: string, threadId: string): Promise<AiMessageListResponse> {
    await this.getThreadOrThrow(orgId, threadId);
    const rows = await this.threads.listMessages(threadId);
    return rows.map(toAiMessageResponse);
  }

  // §8: "read на scope-ресурс треда (свой тред)" — не CASL-грант (тот же приём, что
  // PagesService.deleteComment): автор всегда может удалить свой тред, иначе Manager+.
  async remove(orgId: string, threadId: string, actorId: string, actorRole: Role): Promise<void> {
    const thread = await this.getThreadOrThrow(orgId, threadId);
    const isCreator = thread.createdById === actorId;
    const isManagerPlus = roleRank(actorRole) >= roleRank("MANAGER");
    if (!isCreator && !isManagerPlus) throw new ForbiddenActionError();

    await this.threads.delete(threadId);
  }

  /**
   * §6 шаг 2-5 — confirm: перепроверяет CASL актора (не ассистента) на конкретное действие,
   * исполняет ЧЕРЕЗ существующий сервис (ActivityEvent пишется этим сервисом автоматически, P4),
   * помечает EXECUTED. Гонка "состояние успело измениться" (§10: фаза/сосед удалены между propose
   * и confirm) — исполняющий сервис бросает ResourceNotFoundError/ConflictError, ловим её здесь,
   * помечаем toolCall REJECTED (не оставляем висеть PROPOSED — предложение больше не актуально) и
   * отдаём 409 ToolCallNotPendingError, а не транспортный код исполняющего сервиса.
   *
   * code review: PROPOSED → CONFIRMED — сначала "застолбить" callId под advisory-локом в
   * транзакции (claimToolCall), ТОЛЬКО ПОТОМ исполнять. Раньше между чтением статуса и записью
   * EXECUTED не было ничего — два конкурентных confirm на один callId оба проходили проверку
   * status===PROPOSED, и side-effecting действие (create_task) исполнялось дважды. CONFIRMED —
   * тот самый переходный статус, для которого он и заведён в схеме ("юзер нажал, ещё выполняется").
   */
  async confirmToolCall(orgId: string, threadId: string, callId: string, actorId: string, actorRole: Role): Promise<AiMessageResponse> {
    const thread = await this.getThreadOrThrow(orgId, threadId);
    const { message, toolCall } = await this.claimToolCall(threadId, callId, "CONFIRMED");

    const policy = TOOL_POLICY[toolCall.tool];
    if (policy && !defineAbilityForRole(actorRole).can(policy.action, policy.subject)) {
      // Откатываем застолбленный CONFIRMED обратно в PROPOSED — 403 не должен "сжигать" попытку:
      // с нужной ролью действие остаётся confirmable, не превращается в 409 навсегда.
      await this.replaceToolCall(message, callId, { ...toolCall, status: "PROPOSED" });
      throw new ForbiddenActionError();
    }
    if (!thread.projectId) throw new ResourceNotFoundError("Unsupported thread scope");

    try {
      const result = await this.executor.execute(toolCall.tool, orgId, thread.projectId, actorId, toolCall.args);
      const updated = await this.replaceToolCall(message, callId, { ...toolCall, status: "EXECUTED", result });
      return toAiMessageResponse(updated);
    } catch (error) {
      if (error instanceof ResourceNotFoundError || error instanceof ConflictError) {
        await this.replaceToolCall(message, callId, { ...toolCall, status: "REJECTED", result: { error: error.message } });
        throw new ToolCallNotPendingError("The proposed action is no longer valid; the underlying state has changed");
      }
      throw error;
    }
  }

  // §8: "read на scope-ресурс треда" — reject не исполняет ничего, поэтому не требует CASL сверх
  // обычного доступа к треду (уже проверен CheckPolicy на контроллере). Тот же лок, что confirm —
  // конкурентные confirm+reject на один callId сериализуются, второй видит уже не-PROPOSED → 409.
  async rejectToolCall(orgId: string, threadId: string, callId: string): Promise<AiMessageResponse> {
    await this.getThreadOrThrow(orgId, threadId);
    // claimToolCall(..., "REJECTED") уже полностью выполняет и персистит переход — reject не
    // исполняет ничего после, в отличие от confirm, которому claim даёт лишь промежуточный CONFIRMED.
    const { message } = await this.claimToolCall(threadId, callId, "REJECTED");
    return toAiMessageResponse(message);
  }

  // Под advisory-локом (ai-threads.repository.ts lockToolCall): читает актуальный toolCall,
  // проверяет status===PROPOSED и СРАЗУ помечает его targetStatus — конкурентный confirm/reject
  // на тот же callId либо ждёт лок и видит уже не-PROPOSED (409), либо (если это тот же процесс)
  // упорядочен относительно этого вызова.
  private async claimToolCall(
    threadId: string,
    callId: string,
    targetStatus: ToolCallStatus,
  ): Promise<{ message: MessageRow; toolCall: ToolCall }> {
    return this.prisma.client.$transaction(async (tx) => {
      await this.threads.lockToolCall(callId, tx);
      const { message, toolCall } = await this.findToolCallOrThrow(threadId, callId, tx);
      if (toolCall.status !== "PROPOSED") throw new ToolCallNotPendingError();

      const claimed: ToolCall = { ...toolCall, status: targetStatus };
      const updated = await this.replaceToolCall(message, callId, claimed, tx);
      return { message: updated, toolCall: claimed };
    });
  }

  private async findToolCallOrThrow(
    threadId: string,
    callId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<{ message: MessageRow; toolCall: ToolCall }> {
    const messages = await this.threads.listMessages(threadId, tx);
    for (const message of messages) {
      const toolCalls = (message.toolCalls as ToolCall[] | null) ?? [];
      const toolCall = toolCalls.find((tc) => tc.id === callId);
      if (toolCall) return { message, toolCall };
    }
    throw new ResourceNotFoundError("Tool call not found");
  }

  private async replaceToolCall(
    message: MessageRow,
    callId: string,
    updated: ToolCall,
    tx?: Prisma.TransactionClient,
  ): Promise<MessageRow> {
    const toolCalls = ((message.toolCalls as ToolCall[] | null) ?? []).map((tc) => (tc.id === callId ? updated : tc));
    return this.threads.updateToolCalls(message.id, toolCalls as unknown as Prisma.InputJsonValue, tx);
  }

  /**
   * §4 шаги 1-5: всё, что должно провалиться ОБЫЧНОЙ HTTP-ошибкой (404 тред, 422 провайдер не
   * настроен) — ДО открытия SSE-потока (заголовки text/event-stream ещё не отправлены, поэтому
   * AllExceptionsFilter может честно превратить исключение в JSON-ответ, не SSE-событие).
   * Отдельный метод от streamChat() — контроллер обязан await'нуть prepareChat() ВНЕ try/catch,
   * который перехватывает ошибки стрима (§12: провайдер недоступен ПОСЛЕ начала стрима → SSE
   * error-событие, не HTTP-статус — тогда уже поздно менять заголовки ответа).
   */
  async prepareChat(orgId: string, threadId: string, userId: string, actorRole: Role, dto: CreateAiMessageInput): Promise<ChatSession> {
    const thread = await this.getThreadOrThrow(orgId, threadId);
    if (!thread.projectId) {
      // Фаза 1 — только scope=PROJECT (ai-chat.md §0/§13); WORKSPACE/ORG тредов сегодня в БД
      // возникнуть не может (createThread их не создаёт), но не молчим, если инвариант нарушен.
      throw new ResourceNotFoundError("Unsupported thread scope");
    }
    const project = await this.projects.findByIdInOrg(thread.projectId, orgId);
    if (!project) throw new ResourceNotFoundError("Project not found");

    // §12: "AI не настроен для этой организации" — до сохранения вопроса и до открытия потока.
    const chatProvider = await this.aiProvider.getChatProvider(orgId);
    const embeddingProvider = await this.aiProvider.getEmbeddingProvider(orgId);

    // code review: весь fallible-путь (внешний embedding-провайдер, retrieval, чтение проекта)
    // идёт ДО первой записи в БД. Раньше USER-сообщение сохранялось ПЕРЕД embed() — сбой
    // провайдера (таймаут/сеть) оставлял бы его сиротой без ответа и без сигнала клиенту (заголовки
    // ещё не отправлены → это просто 500, не SSE-событие; на перезагрузке треда вопрос висит
    // безответным, будто приложение его проглотило). Порядок ниже: сначала всё, что может
    // провалиться, потом ровно две записи (сообщение + title/touch) — и только когда весь
    // остальной путь уже гарантированно успешен.
    const [queryEmbedding] = await embeddingProvider.embed([dto.content]);
    if (!queryEmbedding) throw new Error("Embedding provider returned no vector for the question");

    const [retrieved, structuredContext, priorHistory] = await Promise.all([
      this.chunks.searchProjectScope(orgId, project.id, project.workspaceId, queryEmbedding, RETRIEVAL_TOP_K),
      this.buildStructuredContext(project),
      this.threads.listMessages(threadId),
    ]);

    await this.threads.createMessage({ threadId, role: "USER", content: dto.content });
    if (thread.title === null) {
      await this.threads.updateTitle(threadId, dto.content.slice(0, 80));
    } else {
      await this.threads.touch(threadId);
    }

    const messages = this.buildProviderMessages(retrieved, structuredContext, actorRole, priorHistory, dto.content);
    const citations = toCitations(retrieved);

    return {
      threadId,
      messages,
      citations,
      streamChat: (params) => chatProvider.streamChat(params),
    };
  }

  // §4 шаг 6-7: стримит токены/tool-предложения провайдера как есть, накапливая контент, и
  // сохраняет ASSISTANT-сообщение ТОЛЬКО при штатном завершении ("done") — §12: провайдер
  // недоступен/timeout НЕ должен оставить в истории пустой/битый ответ ассистента.
  async *streamChat(session: ChatSession): AsyncGenerator<AiWireEvent, void> {
    let content = "";
    const toolCalls: ToolCall[] = [];
    let finishedCleanly = false;

    for await (const event of session.streamChat({ messages: session.messages, tools: buildToolSchemas() })) {
      if (event.type === "text_delta") content += event.text;
      if (event.type === "tool_call_proposed") {
        const tool = event.tool as ToolName;
        // §6: read-only инструменты (draft_email/summarize_files, TOOL_POLICY[tool] === null)
        // "выполняются сразу, как ответ, а не как proposed-action" — confirm-эндпоинт их не
        // обрабатывает вовсе, поэтому им незачем зависать в PROPOSED. Результат — сами args:
        // draft_email не имеет отдельного "выполнения" (черновик УЖЕ есть в args), а
        // summarize_files возвращает то же самое, поскольку модель не получает результат tool-call
        // обратно в этом же ходе (agentic tool-result loop — вне скоупа Фазы 1, §11).
        const isReadOnly = READ_ONLY_TOOL_NAMES.includes(tool);
        toolCalls.push({
          id: event.id,
          tool,
          args: event.args,
          status: isReadOnly ? "EXECUTED" : "PROPOSED",
          result: isReadOnly ? event.args : undefined,
        });
      }
      yield event;
      if (event.type === "done") {
        finishedCleanly = true;
        break;
      }
      if (event.type === "error") {
        this.logger.warn(`Chat provider stream error for thread ${session.threadId}: ${event.message}`);
        break;
      }
    }

    if (!finishedCleanly) return;

    const saved = await this.threads.createMessage({
      threadId: session.threadId,
      role: "ASSISTANT",
      content,
      citations: session.citations.length > 0 ? (session.citations as unknown as Prisma.InputJsonValue) : undefined,
      toolCalls: toolCalls.length > 0 ? (toolCalls as unknown as Prisma.InputJsonValue) : undefined,
    });
    yield { type: "message_saved", message: toAiMessageResponse(saved) };
  }

  private async getThreadOrThrow(orgId: string, threadId: string) {
    const thread = await this.threads.findByIdInOrg(threadId, orgId);
    if (!thread) throw new ResourceNotFoundError("Thread not found");
    return thread;
  }

  // §2 стратегия 2 — structured injection: прямое чтение, без эмбеддинга. Компактный JSON-блок,
  // не полный ProjectResponse (P3) — только то, что полезно ассистенту как контекст лида.
  private async buildStructuredContext(project: ProjectRow): Promise<string> {
    const [contactsByProject, events] = await Promise.all([
      this.projects.contactsByProjectIds([project.id]),
      this.activityLog.listByProject(project.id),
    ]);

    const context = {
      title: project.title,
      status: project.status,
      value: project.value === null ? null : Number(project.value),
      currency: project.currency,
      source: project.source,
      fields: project.fields,
      contacts: contactsByProject.get(project.id) ?? [],
      recentActivity: events.slice(0, 10).map((e) => ({ type: e.type, payload: e.payload, createdAt: e.createdAt.toISOString() })),
    };
    return JSON.stringify(context);
  }

  // priorHistory/currentQuestion разделены (не единый re-fetch после записи) — code review:
  // prepareChat() теперь читает историю ДО того, как пишет текущий вопрос (см. комментарий там),
  // поэтому текущий вопрос сюда приходит как отдельный параметр, не как последняя строка history.
  private buildProviderMessages(
    retrieved: RetrievedChunk[],
    structuredContext: string,
    actorRole: Role,
    priorHistory: MessageRow[],
    currentQuestion: string,
  ): ChatMessage[] {
    const excerpts =
      retrieved.length > 0
        ? retrieved.map((chunk, i) => `[${i + 1}] (${chunk.sourceType}) ${chunk.content}`).join("\n\n")
        : "(no relevant documents found)";
    const permissionNotes = buildToolPermissionNotes(actorRole);

    const systemPrompt = [
      "You are Helix's AI assistant for this project. Answer using the context below when relevant.",
      "Project context (JSON):",
      structuredContext,
      "Relevant document excerpts:",
      excerpts,
      permissionNotes,
    ]
      .filter(Boolean)
      .join("\n\n");

    // -1 слот резервируется под currentQuestion, добавляемый отдельно ниже.
    const recentHistory = priorHistory.slice(-(HISTORY_MESSAGE_LIMIT - 1)).map(
      (m): ChatMessage => ({ role: m.role === "USER" ? "user" : "assistant", content: m.content }),
    );

    return [
      { role: "system", content: systemPrompt },
      ...recentHistory,
      { role: "user", content: currentQuestion },
    ];
  }
}

// §1.3 P2: citations — снапшот источников, использованных в момент ответа, не живая ссылка.
// Дедуп по sourceId (несколько чанков одного документа не должны дать несколько ссылок на него).
function toCitations(retrieved: RetrievedChunk[]): Citation[] {
  const seen = new Set<string>();
  const citations: Citation[] = [];
  for (const chunk of retrieved) {
    if (seen.has(chunk.sourceId)) continue;
    seen.add(chunk.sourceId);
    citations.push({ sourceType: chunk.sourceType, sourceId: chunk.sourceId, label: chunk.content.slice(0, 80) });
    if (citations.length >= MAX_CITATIONS) break;
  }
  return citations;
}
