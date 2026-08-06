import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateWorkspaceInput, UpdateWorkspaceInput, WorkspaceResponse } from "@helix/api-schemas";
import { workspaceResponseSchema } from "@helix/api-schemas";
import { queryKeys, request } from "../../shared/api";
import { useT, type MessageKey } from "../../shared/i18n";
import { useToast } from "../../shared/toast/use-toast";
import { toWorkspaceError } from "./workspace-error";

function workspaceErrorKey(kind: ReturnType<typeof toWorkspaceError>): MessageKey {
  switch (kind) {
    case "permissionDenied":
      return "workspaces.error.permissionDenied";
    case "notFound":
      return "workspaces.error.notFound";
    default:
      return "workspaces.error.unexpected";
  }
}

export function useCreateWorkspace(orgId: string) {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.workspaces(orgId);
  const t = useT();
  const toast = useToast();

  return useMutation({
    // audience опционален (blueprints.md §3: если не передан, побеждает audience блюпринта) —
    // отдельная перегрузка на "с блюпринтом"/"без" не нужна, форма запроса общая.
    mutationFn: (input: CreateWorkspaceInput) =>
      request({
        method: "POST",
        path: "/v1/workspaces",
        body: input,
        schema: workspaceResponseSchema,
      }),
    onError: (error) => {
      const kind = toWorkspaceError(error);
      if (kind === "permissionDenied") void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      toast.error(t(workspaceErrorKey(kind)));
    },
    onSuccess: (workspace) => {
      queryClient.setQueryData<WorkspaceResponse[]>(queryKey, (current) => [...(current ?? []), workspace]);
      toast.show(t("workspaces.create.success", { name: workspace.name }));
    },
  });
}

export function useUpdateWorkspace(orgId: string) {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.workspaces(orgId);
  const t = useT();
  const toast = useToast();

  return useMutation({
    mutationFn: (vars: { id: string; input: UpdateWorkspaceInput }) =>
      request({
        method: "PATCH",
        path: `/v1/workspaces/${vars.id}`,
        body: vars.input,
        schema: workspaceResponseSchema,
      }),
    onError: (error) => {
      const kind = toWorkspaceError(error);
      if (kind === "permissionDenied") void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      toast.error(t(workspaceErrorKey(kind)));
    },
    onSuccess: (workspace) => {
      queryClient.setQueryData<WorkspaceResponse[]>(queryKey, (current) =>
        current?.map((w) => (w.id === workspace.id ? workspace : w)),
      );
      toast.show(t("workspaces.edit.success", { name: workspace.name }));
    },
  });
}

export function useDeleteWorkspace(orgId: string) {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.workspaces(orgId);
  const t = useT();
  const toast = useToast();

  return useMutation({
    mutationFn: (vars: { id: string; name: string }) =>
      request({ method: "DELETE", path: `/v1/workspaces/${vars.id}`, schema: workspaceResponseSchema.nullable() }),
    onError: (error) => {
      const kind = toWorkspaceError(error);
      if (kind === "permissionDenied") void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      toast.error(t(workspaceErrorKey(kind)));
    },
    onSuccess: (_response, vars) => {
      queryClient.setQueryData<WorkspaceResponse[]>(queryKey, (current) => current?.filter((w) => w.id !== vars.id));
      toast.show(t("workspaces.delete.success", { name: vars.name }));
    },
  });
}
