import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { WorkspaceResponse } from "@helix/api-schemas";
import { workspaceResponseSchema } from "@helix/api-schemas";
import { request, queryKeys } from "../../shared/api";
import { useT, type MessageKey } from "../../shared/i18n";
import { useToast } from "../../shared/toast/use-toast";
import { workspaceQueryOptions } from "./queries";
import { toPhaseError } from "./phase-error";

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
    default:
      return "phases.error.unexpected";
  }
}

export function useReorderPhases(orgId: string, workspaceId: string) {
  const queryClient = useQueryClient();
  const { queryKey } = workspaceQueryOptions(orgId, workspaceId);
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
      const snapshot = queryClient.getQueryData<WorkspaceResponse>(queryKey);
      queryClient.setQueryData<WorkspaceResponse>(
        queryKey,
        (current) => current && reorderLocally(current, vars.phaseIds),
      );
      return { snapshot };
    },
    // Единый rollback: откат к снимку onMutate. Конфликт версии (§5.1) — снимок тоже устарел,
    // дополнительно инвалидируем, чтобы подтянуть актуальный `version` и порядок с сервера.
    // §8.2 инвариант #2: 403 — доменный исход, FE-capability оптимистичны → рефетч me (свежие
    // capabilities) вдобавок к тосту, сервер остаётся истиной.
    onError: (error, _vars, ctx) => {
      if (ctx?.snapshot) queryClient.setQueryData(queryKey, ctx.snapshot);
      const kind = toPhaseError(error);
      if (kind === "versionConflict") void queryClient.invalidateQueries({ queryKey });
      if (kind === "permissionDenied") void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      toast.error(t(phaseErrorKey(kind)));
    },
    onSuccess: (workspace) => {
      queryClient.setQueryData(queryKey, workspace);
    },
  });
}
