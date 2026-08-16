import { Injectable } from "@nestjs/common";
import { Prisma, type AiThreadScope, type MessageRole } from "@helix/db";
import { PrismaService } from "../../core/prisma/prisma.service";

export interface AiThreadRow {
  id: string;
  orgId: string;
  scope: AiThreadScope;
  projectId: string | null;
  workspaceId: string | null;
  createdById: string | null;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageRow {
  id: string;
  threadId: string;
  role: MessageRole;
  content: string;
  citations: Prisma.JsonValue;
  toolCalls: Prisma.JsonValue;
  createdAt: Date;
}

const THREAD_SELECT = {
  id: true,
  orgId: true,
  scope: true,
  projectId: true,
  workspaceId: true,
  createdById: true,
  title: true,
  createdAt: true,
  updatedAt: true,
} as const;

const MESSAGE_SELECT = {
  id: true,
  threadId: true,
  role: true,
  content: true,
  citations: true,
  toolCalls: true,
  createdAt: true,
} as const;

export interface CreateThreadData {
  orgId: string;
  scope: AiThreadScope;
  projectId?: string | null;
  workspaceId?: string | null;
  createdById: string;
}

export interface CreateMessageData {
  threadId: string;
  role: MessageRole;
  content: string;
  citations?: Prisma.InputJsonValue;
  toolCalls?: Prisma.InputJsonValue;
}

@Injectable()
export class AiThreadsRepository {
  constructor(private readonly prisma: PrismaService) {}

  createThread(data: CreateThreadData, tx?: Prisma.TransactionClient): Promise<AiThreadRow> {
    return (tx ?? this.prisma.client).aiThread.create({ data, select: THREAD_SELECT });
  }

  findByIdInOrg(id: string, orgId: string, tx?: Prisma.TransactionClient): Promise<AiThreadRow | null> {
    return (tx ?? this.prisma.client).aiThread.findFirst({ where: { id, orgId }, select: THREAD_SELECT });
  }

  // §1.2: scope=PROJECT — Фаза 1. Новые сверху (последняя активность).
  listByProject(projectId: string): Promise<AiThreadRow[]> {
    return this.prisma.client.aiThread.findMany({
      where: { projectId },
      select: THREAD_SELECT,
      orderBy: { updatedAt: "desc" },
    });
  }

  // §1.2: title — авто из первого вопроса (усечённый), выставляется один раз. updatedAt
  // бампается тем же update() (Prisma @updatedAt) — тред с новым сообщением всплывает в списке.
  async updateTitle(id: string, title: string, tx?: Prisma.TransactionClient): Promise<void> {
    await (tx ?? this.prisma.client).aiThread.update({ where: { id }, data: { title } });
  }

  // Бампает updatedAt без смены title (сообщение добавлено в уже озаглавленный тред).
  async touch(id: string, tx?: Prisma.TransactionClient): Promise<void> {
    await (tx ?? this.prisma.client).aiThread.update({ where: { id }, data: { updatedAt: new Date() } });
  }

  async delete(id: string, tx?: Prisma.TransactionClient): Promise<void> {
    await (tx ?? this.prisma.client).aiThread.delete({ where: { id } });
  }

  createMessage(data: CreateMessageData, tx?: Prisma.TransactionClient): Promise<MessageRow> {
    return (tx ?? this.prisma.client).message.create({ data, select: MESSAGE_SELECT });
  }

  listMessages(threadId: string, tx?: Prisma.TransactionClient): Promise<MessageRow[]> {
    return (tx ?? this.prisma.client).message.findMany({
      where: { threadId },
      select: MESSAGE_SELECT,
      orderBy: { createdAt: "asc" },
    });
  }

  // §6 шаг 5 — confirm/reject перезаписывает ОДИН элемент Message.toolCalls (JSON-массив);
  // вызывающий код (ai-threads.service.ts) собирает полный обновлённый массив, здесь — просто запись.
  updateToolCalls(messageId: string, toolCalls: Prisma.InputJsonValue, tx?: Prisma.TransactionClient): Promise<MessageRow> {
    return (tx ?? this.prisma.client).message.update({ where: { id: messageId }, data: { toolCalls }, select: MESSAGE_SELECT });
  }

  // code review: без лока confirm имел check-then-act гонку — два конкурентных confirm на один
  // callId оба проходили проверку status===PROPOSED до того, как любой из них успевал записать
  // EXECUTED, и side-effecting действие (например, create_task) исполнялось дважды. Advisory-лок,
  // namespace 4343 (тот же приём, что ProjectsRepository.lockPhase — namespace 4242, разводим по
  // hashtext ключа) — сериализует confirm/reject по ОДНОМУ callId; второй запрос блокируется до
  // commit первого, затем видит статус уже НЕ PROPOSED и получает честный 409.
  async lockToolCall(callId: string, tx: Prisma.TransactionClient): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(4343, hashtext(${callId}))`;
  }
}
