import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import type { ProjectAssigneeResponse } from "@helix/api-schemas";
import { projectAssigneeResponseSchema } from "@helix/api-schemas";
import { TransportError } from "../../shared/api";
import { queryKeys, request } from "../../shared/api";
import { useT, type MessageKey } from "../../shared/i18n";
import { toast } from "sonner";
import { projectAssigneesQueryOptions } from "./queries";

type AssigneeError = "alreadyAssigned" | "permissionDenied" | "notFound" | "unexpected";

function toAssigneeError(error: unknown): AssigneeError {
  if (!(error instanceof TransportError)) return "unexpected";
  if (error.kind === "conflict" && error.code === "ASSIGNEE_ALREADY_EXISTS") return "alreadyAssigned";
  if (error.kind === "forbidden") return "permissionDenied";
  if (error.kind === "notFound") return "notFound";
  return "unexpected";
}

function assigneeErrorKey(kind: AssigneeError): MessageKey {
  switch (kind) {
    case "alreadyAssigned":
      return "contacts.error.alreadyAssigned";
    case "permissionDenied":
      return "contacts.error.permissionDenied";
    case "notFound":
      return "contacts.error.notFound";
    default:
      return "contacts.error.unexpected";
  }
}

export interface AssignMemberVariables {
  userId: string;
  optimistic: ProjectAssigneeResponse;
}

export function useAssignMember(orgId: string, projectId: string) {
  const queryClient = useQueryClient();
  const { queryKey } = projectAssigneesQueryOptions(orgId, projectId);
  const t = useT();

  return useMutation({
    mutationFn: (vars: AssignMemberVariables) =>
      request({
        method: "POST",
        path: `/v1/projects/${projectId}/assignees`,
        body: { userId: vars.userId },
        schema: projectAssigneeResponseSchema,
      }),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey });
      const snapshot = queryClient.getQueryData<ProjectAssigneeResponse[]>(queryKey);
      queryClient.setQueryData<ProjectAssigneeResponse[]>(queryKey, (current) => [
        ...(current ?? []),
        vars.optimistic,
      ]);
      return { snapshot };
    },
    onError: (error, _vars, ctx) => {
      if (ctx?.snapshot) queryClient.setQueryData(queryKey, ctx.snapshot);
      const kind = toAssigneeError(error);
      if (kind === "permissionDenied") void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      toast.error(t(assigneeErrorKey(kind)));
    },
  });
}

export function useUnassignMember(orgId: string, projectId: string) {
  const queryClient = useQueryClient();
  const { queryKey } = projectAssigneesQueryOptions(orgId, projectId);
  const t = useT();

  return useMutation({
    mutationFn: (vars: { userId: string }) =>
      request({
        method: "DELETE",
        path: `/v1/projects/${projectId}/assignees/${vars.userId}`,
        schema: z.null(),
      }),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey });
      const snapshot = queryClient.getQueryData<ProjectAssigneeResponse[]>(queryKey);
      queryClient.setQueryData<ProjectAssigneeResponse[]>(
        queryKey,
        (current) => current && current.filter((a) => a.userId !== vars.userId),
      );
      return { snapshot };
    },
    onError: (error, _vars, ctx) => {
      if (ctx?.snapshot) queryClient.setQueryData(queryKey, ctx.snapshot);
      const kind = toAssigneeError(error);
      if (kind === "permissionDenied") void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      toast.error(t(assigneeErrorKey(kind)));
    },
  });
}
