import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  BoardResponse,
  CreatePhaseInput,
  PhaseResponse,
  UpdatePhaseInput,
  WorkspaceResponse,
} from "@helix/api-schemas";
import { phaseResponseSchema, workspaceResponseSchema } from "@helix/api-schemas";
import { z } from "zod";
import { request, queryKeys } from "../../shared/api";
import { useT, type MessageKey } from "../../shared/i18n";
import { useToast } from "../../shared/toast/use-toast";
import { boardQueryOptions } from "../board/queries";
import { workspaceQueryOptions } from "./queries";
import { toPhaseError } from "./phase-error";

// Фаза = колонка доски: любая мутация фазы обязана инвалидировать кэш доски (board/queries.ts),
// иначе название/состав колонок на доске отстаёт от того, что сохранили на "Фазы" (и наоборот —
// после переноса создания в board-view.tsx, veha "борд-фазы"). Партиальный ключ (без limitPerPhase)
// матчит боард-кэш при любом лимите.
function invalidateBoard(queryClient: ReturnType<typeof useQueryClient>, orgId: string, workspaceId: string) {
  void queryClient.invalidateQueries({ queryKey: ["org", orgId, "workspace", workspaceId, "board"] });
}

// Оптимистичный reorder колонок в кэше доски — тот же приём, что useMoveProject (board/mutations.ts:
// spliceMove): патчим кэш В onMutate, а не ждём инвалидации, иначе drag колонки на доске визуально
// "отскочит" к старому порядку на кадр между drop и рефетчем. projects/total/hasMore каждой фазы не
// трогаем — меняется только порядок массива.
function reorderBoardColumnsLocally(board: BoardResponse, phaseIds: string[]): BoardResponse {
  const byId = new Map(board.phases.map((phase) => [phase.id, phase]));
  const phases = phaseIds.flatMap((id) => {
    const phase = byId.get(id);
    return phase ? [phase] : [];
  });
  return { ...board, phases };
}

function sortByOrder(phases: PhaseResponse[]): PhaseResponse[] {
  return [...phases].sort((a, b) => a.order - b.order);
}

export interface ReorderPhasesVariables {
  phaseIds: string[];
  version: number;
}

// Локальный оптимистичный reorder — только порядок массива/`order` (§5.1); rank/uniqueness
// остаются server-owned (DEFERRABLE constraint), клиент их не считает.
function reorderLocally(workspace: WorkspaceResponse, phaseIds: string[]): WorkspaceResponse {
  const byId = new Map((workspace.phases ?? []).map((phase) => [phase.id, phase]));
  const phases = phaseIds.flatMap((id, index) => {
    const phase = byId.get(id);
    return phase ? [{ ...phase, order: index + 1 }] : [];
  });
  return { ...workspace, phases };
}

function phaseErrorKey(kind: ReturnType<typeof toPhaseError>): MessageKey {
  switch (kind) {
    case "versionConflict":
      return "phases.error.versionConflict";
    case "permissionDenied":
      return "phases.error.permissionDenied";
    case "notFound":
      return "phases.error.notFound";
    case "notEmpty":
      return "phases.error.notEmpty";
    default:
      return "phases.error.unexpected";
  }
}

export function useReorderPhases(orgId: string, workspaceId: string) {
  const queryClient = useQueryClient();
  const { queryKey } = workspaceQueryOptions(orgId, workspaceId);
  const { queryKey: boardKey } = boardQueryOptions(orgId, workspaceId);
  const t = useT();
  const toast = useToast();

  return useMutation({
    mutationFn: (vars: ReorderPhasesVariables) =>
      request({
        method: "POST",
        path: `/v1/workspaces/${workspaceId}/phases/reorder`,
        body: vars,
        schema: workspaceResponseSchema,
      }),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey });
      await queryClient.cancelQueries({ queryKey: boardKey });
      const snapshot = queryClient.getQueryData<WorkspaceResponse>(queryKey);
      const boardSnapshot = queryClient.getQueryData<BoardResponse>(boardKey);
      queryClient.setQueryData<WorkspaceResponse>(
        queryKey,
        (current) => current && reorderLocally(current, vars.phaseIds),
      );
      // Доска и /settings/phases читают порядок из РАЗНЫХ кэшей (board vs workspace) — оба должны
      // отреагировать оптимистично, иначе drag колонки на доске увидит reorderLocally только
      // косвенно, через инвалидацию на успехе (визуальный "отскок" к старому порядку на кадр).
      queryClient.setQueryData<BoardResponse>(
        boardKey,
        (current) => current && reorderBoardColumnsLocally(current, vars.phaseIds),
      );
      return { snapshot, boardSnapshot };
    },
    // Единый rollback: откат к снимку onMutate. Конфликт версии (§5.1) — снимок тоже устарел,
    // дополнительно инвалидируем, чтобы подтянуть актуальный `version` и порядок с сервера.
    // §8.2 инвариант #2: 403 — доменный исход, FE-capability оптимистичны → рефетч me (свежие
    // capabilities) вдобавок к тосту, сервер остаётся истиной.
    onError: (error, _vars, ctx) => {
      if (ctx?.snapshot) queryClient.setQueryData(queryKey, ctx.snapshot);
      if (ctx?.boardSnapshot) queryClient.setQueryData(boardKey, ctx.boardSnapshot);
      const kind = toPhaseError(error);
      if (kind === "versionConflict") {
        void queryClient.invalidateQueries({ queryKey });
        void queryClient.invalidateQueries({ queryKey: boardKey });
      }
      if (kind === "permissionDenied") void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      toast.error(t(phaseErrorKey(kind)));
    },
    onSuccess: (workspace) => {
      queryClient.setQueryData(queryKey, workspace);
      invalidateBoard(queryClient, orgId, workspaceId);
    },
  });
}

export function useCreatePhase(orgId: string, workspaceId: string) {
  const queryClient = useQueryClient();
  const { queryKey } = workspaceQueryOptions(orgId, workspaceId);
  const t = useT();
  const toast = useToast();

  return useMutation({
    mutationFn: (input: CreatePhaseInput) =>
      request({
        method: "POST",
        path: `/v1/workspaces/${workspaceId}/phases`,
        body: input,
        schema: phaseResponseSchema,
      }),
    onError: (error) => {
      const kind = toPhaseError(error);
      if (kind === "permissionDenied") void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      toast.error(t(phaseErrorKey(kind)));
    },
    onSuccess: (phase) => {
      queryClient.setQueryData<WorkspaceResponse>(
        queryKey,
        (current) => current && { ...current, phases: sortByOrder([...(current.phases ?? []), phase]) },
      );
      invalidateBoard(queryClient, orgId, workspaceId);
      toast.show(t("phases.create.success", { name: phase.name.ru ?? phase.name.en ?? phase.name.uz ?? "" }));
    },
  });
}

export function useUpdatePhase(orgId: string, workspaceId: string) {
  const queryClient = useQueryClient();
  const { queryKey } = workspaceQueryOptions(orgId, workspaceId);
  const t = useT();
  const toast = useToast();

  return useMutation({
    mutationFn: (vars: { phaseId: string; input: UpdatePhaseInput }) =>
      request({
        method: "PATCH",
        path: `/v1/phases/${vars.phaseId}`,
        body: vars.input,
        schema: phaseResponseSchema,
      }),
    onError: (error) => {
      const kind = toPhaseError(error);
      if (kind === "permissionDenied") void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      toast.error(t(phaseErrorKey(kind)));
    },
    onSuccess: (phase) => {
      queryClient.setQueryData<WorkspaceResponse>(
        queryKey,
        (current) =>
          current && {
            ...current,
            phases: sortByOrder((current.phases ?? []).map((p) => (p.id === phase.id ? phase : p))),
          },
      );
      invalidateBoard(queryClient, orgId, workspaceId);
      toast.show(t("phases.edit.success"));
    },
  });
}

export function useDeletePhase(orgId: string, workspaceId: string) {
  const queryClient = useQueryClient();
  const { queryKey } = workspaceQueryOptions(orgId, workspaceId);
  const t = useT();
  const toast = useToast();

  return useMutation({
    mutationFn: (vars: { phaseId: string; reassignTo?: string }) =>
      request({
        method: "DELETE",
        path: `/v1/phases/${vars.phaseId}`,
        searchParams: { reassignTo: vars.reassignTo },
        schema: z.null(),
      }),
    // notEmpty — не ошибка в привычном смысле, а развилка (нужен reassignTo от пользователя);
    // тост/рефетч me не нужны, вызывающий диалог сам покажет пикер кандидатов (phase-error.ts).
    onError: (error) => {
      const kind = toPhaseError(error);
      if (kind === "notEmpty") return;
      if (kind === "permissionDenied") void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      toast.error(t(phaseErrorKey(kind)));
    },
    onSuccess: (_data, vars) => {
      queryClient.setQueryData<WorkspaceResponse>(
        queryKey,
        (current) => current && { ...current, phases: (current.phases ?? []).filter((p) => p.id !== vars.phaseId) },
      );
      invalidateBoard(queryClient, orgId, workspaceId);
      toast.show(t("phases.delete.success"));
    },
  });
}
