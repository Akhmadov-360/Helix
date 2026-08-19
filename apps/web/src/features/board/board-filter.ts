import type { ProjectCardViewModel } from "./select";

/**
 * Клиентский фильтр доски (M1, вариант A из обсуждения): поиск по title + фильтр по
 * ассайни. Backend не трогаем — все проекты доски уже в query cache, фильтрация в UI-слое.
 * Backend-фильтр (query-параметры к boardQueryOptions) — будущее, если суммарный объём
 * доски вырастет за десятки тысяч проектов и клиент перестанет справляться.
 *
 * Дизайн-выбор: assignee-режимы (unassigned / выбранные user id'ы) объединяются через **OR** —
 * ровно как в референсе (Trello): чекбокс "Нет участников" + чекбокс "Иван" вернёт **обоих**
 * проектов без ассайни и проектов с Иваном (не пересечение — оно всегда пустое). Поиск по title
 * — AND с assignee-фильтром: сначала фильтруем по assignees, потом по подстроке в title.
 */
export interface BoardFilterState {
  query: string;
  filterUnassigned: boolean;
  assigneeUserIds: string[];
}

export const EMPTY_FILTER: BoardFilterState = {
  query: "",
  filterUnassigned: false,
  assigneeUserIds: [],
};

export function isFilterActive(filter: BoardFilterState): boolean {
  return filter.query.trim().length > 0 || filter.filterUnassigned || filter.assigneeUserIds.length > 0;
}

/** Считает количество активных "секций" — для бейджа на иконке фильтра. Поиск как одна
 *  секция независимо от длины строки, assignee-выбор как одна независимо от количества id'ов. */
export function activeFilterCount(filter: BoardFilterState): number {
  let count = 0;
  if (filter.query.trim().length > 0) count += 1;
  if (filter.filterUnassigned || filter.assigneeUserIds.length > 0) count += 1;
  return count;
}

export function matchesFilter(project: ProjectCardViewModel, filter: BoardFilterState): boolean {
  const query = filter.query.trim().toLowerCase();
  if (query.length > 0 && !project.title.toLowerCase().includes(query)) return false;

  const assigneeFilterActive = filter.filterUnassigned || filter.assigneeUserIds.length > 0;
  if (!assigneeFilterActive) return true;

  if (filter.filterUnassigned && project.assignees.length === 0) return true;
  if (filter.assigneeUserIds.some((id) => project.assignees.some((a) => a.userId === id))) return true;

  return false;
}
