import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  BoardProjectResponse,
  BoardResponse,
  ColumnResponse,
  CreateProjectInput,
  ProjectResponse,
} from "@helix/api-schemas";
import { columnResponseSchema, projectResponseSchema } from "@helix/api-schemas";
import { request, queryKeys } from "../../shared/api";
import { useT, type MessageKey } from "../../shared/i18n";
import { useToast } from "../../shared/toast/use-toast";
import { boardQueryOptions } from "./queries";
import { toBoardError } from "./board-error";

export interface MoveVariables {
  id: string;
  fromPhaseId: string;
  toPhaseId: string;
  afterId: string | null;
  beforeId: string | null;
}

// ADR-FE-2 (§7): сплайс массива по позиции дропа, БЕЗ вычисления rank — клиент не считает rank
// и не хранит fractional-алгоритм, только меняет местами id между колонками кэша.
function spliceMove(board: BoardResponse, vars: MoveVariables): BoardResponse {
  const phases = board.phases.map((phase) => ({ ...phase, projects: [...phase.projects] }));
  const fromPhase = phases.find((phase) => phase.id === vars.fromPhaseId);
  const toPhase = phases.find((phase) => phase.id === vars.toPhaseId);
  if (!fromPhase || !toPhase) return board;

  const sourceIndex = fromPhase.projects.findIndex((project) => project.id === vars.id);
  if (sourceIndex === -1) return board;
  const [project] = fromPhase.projects.splice(sourceIndex, 1);
  if (!project) return board;
  if (fromPhase !== toPhase) fromPhase.total -= 1;

  let insertAt = toPhase.projects.length;
  if (vars.beforeId) {
    const beforeIndex = toPhase.projects.findIndex((p) => p.id === vars.beforeId);
    if (beforeIndex !== -1) insertAt = beforeIndex;
  } else if (vars.afterId) {
    const afterIndex = toPhase.projects.findIndex((p) => p.id === vars.afterId);
    insertAt = afterIndex === -1 ? toPhase.projects.length : afterIndex + 1;
  } else {
    insertAt = 0;
  }
  toPhase.projects.splice(insertAt, 0, { ...project, phaseId: vars.toPhaseId });
  if (fromPhase !== toPhase) toPhase.total += 1;

  return { ...board, phases };
}

// onSuccess патчит карту из ОТВЕТА (§7) — реальный rank/status только у сервера, порядок массива
// (уже верный из optimistic-сплайса) трогать не нужно. move/reassign/archive/restore возвращают
// плоский ProjectResponse (без doneTasksCount/assignees, §13.4 redesign — эти агрегаты не
// пересчитываются на КАЖДОЙ мутации), поэтому мёржим поверх уже закэшированной карточки, а не
// заменяем целиком — иначе слетели бы счётчик задач и аватарки co-workers.
function patchProject(board: BoardResponse, project: ProjectResponse): BoardResponse {
  return {
    ...board,
    phases: board.phases.map((phase) =>
      phase.id === project.phaseId
        ? { ...phase, projects: phase.projects.map((p) => (p.id === project.id ? { ...p, ...project } : p)) }
        : phase,
    ),
  };
}

// Лид создаётся всегда в первой фазе, наверху колонки (§1, projects.controller.ts create()) —
// прекатенируем локально теми же правилами, сервер уже так и создал. Свежесозданный лид точно
// без задач/co-workers/контактов сделки — 0/0/[]/[] корректны, не выдумка (в отличие от
// отсутствующих в ProjectResponse полей, которые пришлось бы гадать).
function prependProject(board: BoardResponse, project: ProjectResponse): BoardResponse {
  const firstPhase = board.phases[0];
  if (!firstPhase || firstPhase.id !== project.phaseId) return board;
  const boardProject: BoardProjectResponse = {
    ...project,
    doneTasksCount: 0,
    totalTasksCount: 0,
    assignees: [],
    contacts: [],
  };
  return {
    ...board,
    phases: board.phases.map((phase) =>
      phase.id === firstPhase.id
        ? { ...phase, projects: [boardProject, ...phase.projects], total: phase.total + 1 }
        : phase,
    ),
  };
}

// §13.4: страница дозаписывается в кэш board (KAN-1 — один источник порядка для DnD), не в
// отдельный кэш. Дедуп по id — дешёвая защита от повторного докрута после рекомпакции фазы (§7).
function appendColumnPage(board: BoardResponse, phaseId: string, page: ColumnResponse): BoardResponse {
  return {
    ...board,
    phases: board.phases.map((phase) => {
      if (phase.id !== phaseId) return phase;
      const existingIds = new Set(phase.projects.map((p) => p.id));
      const newProjects = page.projects.filter((p) => !existingIds.has(p.id));
      return { ...phase, projects: [...phase.projects, ...newProjects], hasMore: page.hasMore };
    }),
  };
}

function boardErrorKey(kind: ReturnType<typeof toBoardError>): MessageKey {
  switch (kind) {
    case "staleNeighbors":
      return "board.error.staleNeighbors";
    case "missingRequiredFields":
      return "board.error.missingRequiredFields";
    case "permissionDenied":
      return "board.error.permissionDenied";
    case "notFound":
      return "board.error.notFound";
    default:
      return "board.error.unexpected";
  }
}

export function useMoveProject(orgId: string, workspaceId: string) {
  const queryClient = useQueryClient();
  const { queryKey } = boardQueryOptions(orgId, workspaceId);
  const t = useT();
  const toast = useToast();

  return useMutation({
    mutationFn: (vars: MoveVariables) =>
      request({
        method: "POST",
        path: `/v1/projects/${vars.id}/move`,
        body: { toPhaseId: vars.toPhaseId, afterId: vars.afterId, beforeId: vars.beforeId },
        schema: projectResponseSchema,
      }),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey });
      const snapshot = queryClient.getQueryData<BoardResponse>(queryKey);
      queryClient.setQueryData<BoardResponse>(queryKey, (current) => current && spliceMove(current, vars));
      return { snapshot };
    },
    // Единый rollback (§9.3): откат к снимку onMutate, не рефетч — кроме STALE_NEIGHBORS (§7),
    // где соседи реально устарели и снимок тоже нерелевантен → дополнительно инвалидируем колонку.
    // §8.2 инвариант #2: 403 — доменный исход (FE-capability оптимистичны, гонка/реассайн между
    // рендером и кликом) → тост + рефетч me (свежие capabilities), сервер остаётся истиной.
    onError: (error, _vars, ctx) => {
      if (ctx?.snapshot) queryClient.setQueryData(queryKey, ctx.snapshot);
      const kind = toBoardError(error);
      if (kind === "staleNeighbors") void queryClient.invalidateQueries({ queryKey });
      if (kind === "permissionDenied") void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      toast.error(t(boardErrorKey(kind)));
    },
    onSuccess: (project) => {
      queryClient.setQueryData<BoardResponse>(queryKey, (current) => current && patchProject(current, project));
    },
  });
}

export function useCreateProject(orgId: string, workspaceId: string) {
  const queryClient = useQueryClient();
  const { queryKey } = boardQueryOptions(orgId, workspaceId);
  const t = useT();
  const toast = useToast();

  return useMutation({
    mutationFn: (input: CreateProjectInput) =>
      request({
        method: "POST",
        path: `/v1/workspaces/${workspaceId}/projects`,
        body: input,
        schema: projectResponseSchema,
      }),
    // missingRequiredFields — развилка, которую показывает сама форма (подсветка полей, §7), не
    // тост-ошибка (тот же приём, что notEmpty у useDeletePhase).
    onError: (error) => {
      const kind = toBoardError(error);
      if (kind === "missingRequiredFields") return;
      if (kind === "permissionDenied") void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      toast.error(t(boardErrorKey(kind)));
    },
    onSuccess: (project) => {
      queryClient.setQueryData<BoardResponse>(queryKey, (current) => current && prependProject(current, project));
      toast.show(t("board.create.success", { title: project.title }));
    },
  });
}

// Убрать карточку из кэша доски (архив/удаление): архив фильтруется бэком из board-запроса
// (status <> 'ARCHIVED'), удаление — физическое. В обоих случаях карточка пропадает с доски.
function removeProject(board: BoardResponse, projectId: string): BoardResponse {
  return {
    ...board,
    phases: board.phases.map((phase) => {
      const index = phase.projects.findIndex((p) => p.id === projectId);
      if (index === -1) return phase;
      const projects = phase.projects.filter((p) => p.id !== projectId);
      return { ...phase, projects, total: phase.total - 1 };
    }),
  };
}

// Архивация обратима (restore есть) — без confirm-диалога, прямое действие + тост.
export function useArchiveProject(orgId: string, workspaceId: string) {
  const queryClient = useQueryClient();
  const { queryKey } = boardQueryOptions(orgId, workspaceId);
  const t = useT();
  const toast = useToast();

  return useMutation({
    mutationFn: (vars: { id: string; title: string }) =>
      request({ method: "POST", path: `/v1/projects/${vars.id}/archive`, schema: projectResponseSchema }),
    onError: (error) => {
      const kind = toBoardError(error);
      if (kind === "permissionDenied") void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      toast.error(t(boardErrorKey(kind)));
    },
    onSuccess: (_project, vars) => {
      queryClient.setQueryData<BoardResponse>(queryKey, (current) => current && removeProject(current, vars.id));
      toast.show(t("board.card.archived", { title: vars.title }));
    },
  });
}

export function useDeleteProject(orgId: string, workspaceId: string) {
  const queryClient = useQueryClient();
  const { queryKey } = boardQueryOptions(orgId, workspaceId);
  const t = useT();
  const toast = useToast();

  return useMutation({
    mutationFn: (vars: { id: string; title: string }) =>
      request({ method: "DELETE", path: `/v1/projects/${vars.id}`, schema: projectResponseSchema.nullable() }),
    onError: (error) => {
      const kind = toBoardError(error);
      if (kind === "permissionDenied") void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      toast.error(t(boardErrorKey(kind)));
    },
    onSuccess: (_response, vars) => {
      queryClient.setQueryData<BoardResponse>(queryKey, (current) => current && removeProject(current, vars.id));
      toast.show(t("board.card.deleted", { title: vars.title }));
    },
  });
}

// §13.4: физически GET, но моделируется useMutation — разовое действие с побочным эффектом на
// чужом кэше (board), не самостоятельно рендерящийся ресурс (useQuery было бы неверной моделью).
export function useLoadMoreColumn(orgId: string, workspaceId: string) {
  const queryClient = useQueryClient();
  const { queryKey } = boardQueryOptions(orgId, workspaceId);
  const t = useT();
  const toast = useToast();

  return useMutation({
    mutationFn: (vars: { phaseId: string }) => {
      const board = queryClient.getQueryData<BoardResponse>(queryKey);
      const phase = board?.phases.find((p) => p.id === vars.phaseId);
      const last = phase?.projects.at(-1);
      return request({
        path: `/v1/phases/${vars.phaseId}/projects`,
        searchParams: { cursorRank: last?.rank, cursorId: last?.id },
        schema: columnResponseSchema,
      }).then((page) => ({ phaseId: vars.phaseId, page }));
    },
    onError: (error) => {
      const kind = toBoardError(error);
      if (kind === "permissionDenied") void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      toast.error(t(boardErrorKey(kind)));
    },
    onSuccess: ({ phaseId, page }) => {
      queryClient.setQueryData<BoardResponse>(
        queryKey,
        (current) => current && appendColumnPage(current, phaseId, page),
      );
    },
  });
}
