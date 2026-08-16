import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Res, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  createAiMessageSchema,
  type AiMessageListResponse,
  type AiMessageResponse,
  type AiThreadListResponse,
  type AiThreadResponse,
  type CreateAiMessageInput,
} from "@helix/api-schemas";
import type { Response } from "express";
import { CurrentAuth, type AuthContext } from "../../core/auth-context";
import { CheckPolicy } from "../../core/authz/check-policy.decorator";
import { PoliciesGuard } from "../../core/authz/policies.guard";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AiThreadsService } from "./ai-threads.service";

// ai-chat.md §7: нет отдельного CASL-субъекта AiThread — Фаза 1 существует только scope=PROJECT,
// доступ проверяется по capability на сам Project (read). §8 — таблица эндпоинтов.
@ApiTags("ai-threads")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller()
export class AiThreadsController {
  constructor(private readonly aiThreads: AiThreadsService) {}

  @Post("projects/:projectId/ai-threads")
  @CheckPolicy("read", "Project")
  create(@CurrentAuth() auth: AuthContext, @Param("projectId") projectId: string): Promise<AiThreadResponse> {
    return this.aiThreads.createThread(auth.activeOrgId, projectId, auth.userId);
  }

  @Get("projects/:projectId/ai-threads")
  @CheckPolicy("read", "Project")
  list(@CurrentAuth() auth: AuthContext, @Param("projectId") projectId: string): Promise<AiThreadListResponse> {
    return this.aiThreads.listThreads(auth.activeOrgId, projectId);
  }

  @Get("ai-threads/:id/messages")
  @CheckPolicy("read", "Project")
  listMessages(@CurrentAuth() auth: AuthContext, @Param("id") id: string): Promise<AiMessageListResponse> {
    return this.aiThreads.listMessages(auth.activeOrgId, id);
  }

  @Delete("ai-threads/:id")
  @HttpCode(HttpStatus.OK)
  @CheckPolicy("read", "Project")
  async remove(@CurrentAuth() auth: AuthContext, @Param("id") id: string): Promise<null> {
    await this.aiThreads.remove(auth.activeOrgId, id, auth.userId, auth.role);
    return null;
  }

  // §4 — SSE. prepareChat() выполняется ДО открытия потока: 404/422 отсюда идут обычным
  // JSON-ответом через AllExceptionsFilter (см. комментарий на prepareChat), заголовки
  // text/event-stream отправляются только после успешной подготовки. Ошибка ВНУТРИ стрима
  // (провайдер оборвался) уже не может стать HTTP-статусом — уходит SSE `error`-событием (§12).
  @Post("ai-threads/:id/messages")
  @CheckPolicy("read", "Project")
  async postMessage(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(createAiMessageSchema)) dto: CreateAiMessageInput,
    @Res() res: Response,
  ): Promise<void> {
    const session = await this.aiThreads.prepareChat(auth.activeOrgId, id, auth.userId, auth.role, dto);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    try {
      for await (const event of this.aiThreads.streamChat(session)) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    } catch (error) {
      // code review: если оборвался сам res.write() (клиент уже отключился), повторный write здесь
      // ниже тоже бросит — глотаем, сокет всё равно мёртв, сообщать уже некому.
      const message = error instanceof Error ? error.message : "Unknown streaming error";
      try {
        res.write(`data: ${JSON.stringify({ type: "error", message })}\n\n`);
      } catch {
        // соединение уже закрыто клиентом — не о чем сообщать.
      }
    } finally {
      res.end();
    }
  }

  // §6 шаг 2 — CASL-проверка зависит от КОНКРЕТНОГО инструмента (move_phase → Project.update,
  // create_task → Task.create, …), не статична для этого эндпоинта → не выражается через
  // @CheckPolicy (один декоратор — одна пара action/subject на весь handler). Динамическая
  // проверка — внутри AiThreadsService.confirmToolCall (TOOL_POLICY, tool-schema.ts). Guard'ы
  // здесь дают только аутентификацию + членство в орге (JwtAuthGuard), тот же приём, что
  // PagesController.deleteComment (§4/§7 pages-kb.md — "не через CASL, нет отдельного субъекта").
  @Post("ai-threads/:id/tool-calls/:callId/confirm")
  confirmToolCall(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Param("callId") callId: string,
  ): Promise<AiMessageResponse> {
    return this.aiThreads.confirmToolCall(auth.activeOrgId, id, callId, auth.userId, auth.role);
  }

  // §8: Guard = "read на scope-ресурс треда" — reject не исполняет действие, обычного доступа к
  // треду достаточно (перепроверено в сервисе через getThreadOrThrow, capability — на контроллере).
  @Post("ai-threads/:id/tool-calls/:callId/reject")
  @CheckPolicy("read", "Project")
  rejectToolCall(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Param("callId") callId: string,
  ): Promise<AiMessageResponse> {
    return this.aiThreads.rejectToolCall(auth.activeOrgId, id, callId);
  }
}
