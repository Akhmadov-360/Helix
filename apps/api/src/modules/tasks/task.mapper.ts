import type { TaskPriority, TaskResponse } from "@helix/api-schemas";

// orgId в row не тащим в ответ (internal). dueAt/createdAt/updatedAt — Date из Prisma.
export interface TaskRow {
  id: string;
  projectId: string;
  title: string;
  done: boolean;
  assigneeId: string | null;
  dueAt: Date | null;
  priority: TaskPriority;
  createdAt: Date;
  updatedAt: Date;
}

// overdue — ВЫЧИСЛЯЕМОЕ (§4): сравнение абсолютных моментов (dueAt timestamptz < now()), НЕ хранимое.
// done=true → не просрочен (работа сделана). dueAt=null → нет срока → не просрочен.
export function toTaskResponse(t: TaskRow, now: Date = new Date()): TaskResponse {
  return {
    id: t.id,
    projectId: t.projectId,
    title: t.title,
    done: t.done,
    assigneeId: t.assigneeId,
    dueAt: t.dueAt === null ? null : t.dueAt.toISOString(),
    priority: t.priority,
    overdue: t.dueAt !== null && !t.done && t.dueAt.getTime() < now.getTime(),
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}
