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

// Buckets по due-date для «Tasks-таба» с группировкой (Figma-redesign):
// - overdue: dueAt в прошлом (для open — .overdue уже верное поле контракта);
// - today: dueAt сегодня (по локальной дате);
// - thisWeek: dueAt в течение 7 дней от сегодня (не включая today);
// - later: dueAt > 7 дней;
// - noDueDate: dueAt === null;
// - done — отдельный бакет в конце (независимо от dueAt).
// Внутри каждого — sortTasks-порядок (open dueAt asc, done updatedAt desc).
export type TaskBucketKey = "overdue" | "today" | "thisWeek" | "later" | "noDueDate" | "done";

export interface TaskBucket {
  key: TaskBucketKey;
  tasks: TaskResponse[];
}

// Порядок бакетов в UI — не алфавитный, а по «срочности сверху вниз». Done в самом конце.
const BUCKET_ORDER: readonly TaskBucketKey[] = [
  "overdue",
  "today",
  "thisWeek",
  "later",
  "noDueDate",
  "done",
] as const;

function startOfToday(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

function bucketOf(task: TaskResponse, todayStart: Date): TaskBucketKey {
  if (task.done) return "done";
  if (task.dueAt === null) return "noDueDate";
  const due = new Date(task.dueAt);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);
  const weekEnd = new Date(todayStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  if (due < todayStart) return "overdue";
  if (due < todayEnd) return "today";
  if (due < weekEnd) return "thisWeek";
  return "later";
}

export function bucketizeTasks(tasks: TaskResponse[], now: Date = new Date()): TaskBucket[] {
  const todayStart = startOfToday(now);
  const map = new Map<TaskBucketKey, TaskResponse[]>();
  for (const task of tasks) {
    const key = bucketOf(task, todayStart);
    const existing = map.get(key);
    if (existing) existing.push(task);
    else map.set(key, [task]);
  }
  // Сортировка внутри бакета: open по dueAt asc (null в конец), done по updatedAt desc.
  return BUCKET_ORDER.filter((k) => map.has(k)).map((key) => {
    const list = map.get(key)!;
    if (key === "done") {
      list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    } else {
      list.sort((a, b) => {
        if (a.dueAt === null && b.dueAt === null) return 0;
        if (a.dueAt === null) return 1;
        if (b.dueAt === null) return -1;
        return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
      });
    }
    return { key, tasks: list };
  });
}
