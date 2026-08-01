import type { TaskResponse } from "@helix/api-schemas";

// Клиентская сортировка (§13.2 frontend-architecture.md) — у Task, в отличие от Project.rank,
// нет server-owned порядка (нет /reorder, нет инварианта KAN-1): сортировать здесь не нарушает
// VM-1. open сверху (dueAt asc, null — в конец), done — отдельно, по updatedAt desc.
export function sortTasks(tasks: TaskResponse[]): { open: TaskResponse[]; done: TaskResponse[] } {
  const open = tasks
    .filter((t) => !t.done)
    .sort((a, b) => {
      if (a.dueAt === null && b.dueAt === null) return 0;
      if (a.dueAt === null) return 1;
      if (b.dueAt === null) return -1;
      return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
    });
  const done = tasks
    .filter((t) => t.done)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return { open, done };
}
