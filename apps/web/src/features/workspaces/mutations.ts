import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Audience, CreateWorkspaceInput, WorkspaceResponse } from "@helix/api-schemas";
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
    mutationFn: (input: { name: string; audience: Audience }) =>
      request({
        method: "POST",
        path: "/v1/workspaces",
        body: input satisfies CreateWorkspaceInput,
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
