import { Injectable } from "@nestjs/common";
import type { Prisma } from "@helix/db";
import { PrismaService } from "../../core/prisma/prisma.service";
import type { TaskRow } from "./task.mapper";

const TASK_SELECT = {
  id: true,
  projectId: true,
  title: true,
  done: true,
  assigneeId: true,
  dueAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export interface CreateTaskData {
  orgId: string;
  projectId: string;
  title: string;
  dueAt?: Date | null;
  assigneeId?: string | null;
}

@Injectable()
export class TaskRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateTaskData, tx?: Prisma.TransactionClient): Promise<TaskRow> {
    return (tx ?? this.prisma.client).task.create({ data, select: TASK_SELECT });
  }

  // Список тасков сделки; done=false сверху (открытые важнее), затем свежие. Индекс [projectId, done].
  listByProject(projectId: string, tx?: Prisma.TransactionClient): Promise<TaskRow[]> {
    return (tx ?? this.prisma.client).task.findMany({
      where: { projectId },
      select: TASK_SELECT,
      orderBy: [{ done: "asc" }, { createdAt: "asc" }],
    });
  }

  // Tenant-scope в WHERE: чужой/несуществующий → null → 404 (IDOR). Через orgId, не projectId —
  // /tasks/:taskId не знает проекта, но composite backbone гарантирует таск.orgId = проект.orgId.
  findByIdInOrg(id: string, orgId: string, tx?: Prisma.TransactionClient): Promise<TaskRow | null> {
    return (tx ?? this.prisma.client).task.findFirst({ where: { id, orgId }, select: TASK_SELECT });
  }

  // done меняется ТОЛЬКО через complete/reopen (не PATCH) → здесь его нет.
  updateFields(
    id: string,
    data: { title?: string; dueAt?: Date | null; assigneeId?: string | null },
    tx?: Prisma.TransactionClient,
  ): Promise<TaskRow> {
    return (tx ?? this.prisma.client).task.update({ where: { id }, data, select: TASK_SELECT });
  }

  setDone(id: string, done: boolean, tx?: Prisma.TransactionClient): Promise<TaskRow> {
    return (tx ?? this.prisma.client).task.update({ where: { id }, data: { done }, select: TASK_SELECT });
  }

  async delete(id: string, tx?: Prisma.TransactionClient): Promise<void> {
    await (tx ?? this.prisma.client).task.delete({ where: { id } });
  }
}
