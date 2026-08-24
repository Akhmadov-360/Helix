import type { TaskPriority, TaskResponse } from "@helix/api-schemas";

// UNASSIGNED — sentinel в фильтре assignees: юзер хочет «показать без исполнителя», отличать от
// «без выбранных assignee (не фильтруем)». Использовать null как key в Set неудобно; строковый
// sentinel читается везде без специальной ветки.
export const UNASSIGNED_KEY = "__unassigned__";

export type StatusFilter = "all" | "open" | "done";

export interface TasksFilterState {
  assignees: Set<string>; // userId ИЛИ UNASSIGNED_KEY
  priorities: Set<TaskPriority>;
  status: StatusFilter;
  // Опциональный диапазон по dueAt (calendar-picker). Если from/to заданы — включаем только
  // задачи с dueAt в этих границах включительно (по началу дня); null-dueAt отфильтровываются.
  dueFrom: Date | null;
  dueTo: Date | null;
}

export const initialTasksFilter: TasksFilterState = {
  assignees: new Set(),
  priorities: new Set(),
  status: "all",
  dueFrom: null,
  dueTo: null,
};

export function isTasksFilterActive(state: TasksFilterState): boolean {
  return (
    state.assignees.size > 0 ||
    state.priorities.size > 0 ||
    state.status !== "all" ||
    state.dueFrom !== null ||
    state.dueTo !== null
  );
}

// Предикат — применяется К каждой задаче перед bucketize. AND по всем активным полям (пустые
// множества не фильтруют). Границы диапазона: from — начало дня, to — конец дня (23:59:59.999).
export function taskMatchesFilter(task: TaskResponse, state: TasksFilterState): boolean {
  if (state.status === "open" && task.done) return false;
  if (state.status === "done" && !task.done) return false;

  if (state.assignees.size > 0) {
    const key = task.assigneeId ?? UNASSIGNED_KEY;
    if (!state.assignees.has(key)) return false;
  }

  if (state.priorities.size > 0 && !state.priorities.has(task.priority)) return false;

  if (state.dueFrom !== null || state.dueTo !== null) {
    if (task.dueAt === null) return false;
    const due = new Date(task.dueAt).getTime();
    if (state.dueFrom !== null) {
      const from = new Date(state.dueFrom);
      from.setHours(0, 0, 0, 0);
      if (due < from.getTime()) return false;
    }
    if (state.dueTo !== null) {
      const to = new Date(state.dueTo);
      to.setHours(23, 59, 59, 999);
      if (due > to.getTime()) return false;
    }
  }

  return true;
}
