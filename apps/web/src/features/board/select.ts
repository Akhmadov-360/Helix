import type { BoardResponse, LocalizedName } from "@helix/api-schemas";

export interface ProjectCardViewModel {
  id: string;
  phaseId: string;
  title: string;
  source: string | null;
  amount: { value: number; currency: string } | null;
  doneTasksCount: number;
  totalTasksCount: number;
  assignees: Array<{ userId: string; name: string }>;
  createdAt: string;
}

export interface BoardColumnViewModel {
  id: string;
  phaseName: LocalizedName;
  color: string | null;
  total: number;
  hasMore: boolean;
  projects: ProjectCardViewModel[];
}

export interface BoardViewModel {
  workspaceId: string;
  columns: BoardColumnViewModel[];
}

// select чист (§6.5): меняет ФОРМУ под колонку/карточку. phaseName остаётся сырым LocalizedName —
// локализация не входит сюда, только на render (useLocalize). Порядок массивов не трогаем (KAN-1):
// сервер уже вернул ORDER BY rank, id — клиент не пересортировывает.
export function toBoardViewModel(data: BoardResponse): BoardViewModel {
  return {
    workspaceId: data.workspaceId,
    columns: data.phases.map((phase) => ({
      id: phase.id,
      phaseName: phase.name,
      color: phase.color,
      total: phase.total,
      hasMore: phase.hasMore,
      projects: phase.projects.map((project) => ({
        id: project.id,
        phaseId: project.phaseId,
        title: project.title,
        source: project.source,
        amount:
          project.value === null || project.currency === null
            ? null
            : { value: project.value, currency: project.currency },
        doneTasksCount: project.doneTasksCount,
        totalTasksCount: project.totalTasksCount,
        assignees: project.assignees,
        createdAt: project.createdAt,
      })),
    })),
  };
}
