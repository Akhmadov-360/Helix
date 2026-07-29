import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { BoardResponse, ProjectResponse } from "@helix/api-schemas";
import { projectResponseSchema } from "@helix/api-schemas";
import { request } from "../../shared/api";
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
// (уже верный из optimistic-сплайса) трогать не нужно.
function patchProject(board: BoardResponse, project: ProjectResponse): BoardResponse {
  return {
    ...board,
    phases: board.phases.map((phase) =>
      phase.id === project.phaseId
        ? { ...phase, projects: phase.projects.map((p) => (p.id === project.id ? project : p)) }
        : phase,
    ),
  };
}

export function useMoveProject(orgId: string, workspaceId: string) {
  const queryClient = useQueryClient();
  const { queryKey } = boardQueryOptions(orgId, workspaceId);

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
    onError: (error, _vars, ctx) => {
      if (ctx?.snapshot) queryClient.setQueryData(queryKey, ctx.snapshot);
      if (toBoardError(error) === "staleNeighbors") void queryClient.invalidateQueries({ queryKey });
    },
    onSuccess: (project) => {
      queryClient.setQueryData<BoardResponse>(queryKey, (current) => current && patchProject(current, project));
    },
  });
}
