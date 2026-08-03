import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { BoardResponse, ProjectResponse, ReassignProjectInput, UpdateProjectInput } from "@helix/api-schemas";
import { projectResponseSchema } from "@helix/api-schemas";
import { queryKeys, request } from "../../shared/api";
import { useT, type MessageKey } from "../../shared/i18n";
import { useToast } from "../../shared/toast/use-toast";
import { toBoardError } from "../board/board-error";
import { boardQueryOptions } from "../board/queries";
import { projectQueryOptions } from "./queries";

function errorKey(kind: ReturnType<typeof toBoardError>): MessageKey {
  switch (kind) {
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

// Патчит ДВА кэша (§ форма без выдумки, redesign): project-detail (проект открыт напрямую,
// board мог и не грузиться) — ОБЯЗАТЕЛЬНО, иначе редактирование "не подействует" видимо; board
// (§13.4) — best-effort (no-op через `current &&`, если доска не в кэше — не ошибка).
export function useUpdateProject(orgId: string, workspaceId: string, projectId: string) {
  const queryClient = useQueryClient();
  const { queryKey: projectKey } = projectQueryOptions(orgId, projectId);
  const { queryKey: boardKey } = boardQueryOptions(orgId, workspaceId);
  const t = useT();
  const toast = useToast();

  return useMutation({
    mutationFn: (input: UpdateProjectInput) =>
      request({ method: "PATCH", path: `/v1/projects/${projectId}`, body: input, schema: projectResponseSchema }),
    // missingRequiredFields — подсвечивается прямо в форме (custom-fields.md §7), не тост.
    onError: (error) => {
      const kind = toBoardError(error);
      if (kind === "missingRequiredFields") return;
      if (kind === "permissionDenied") void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      toast.error(t(errorKey(kind)));
    },
    onSuccess: (project: ProjectResponse) => {
      queryClient.setQueryData<ProjectResponse>(projectKey, project);
      queryClient.setQueryData<BoardResponse>(
        boardKey,
        (current) =>
          current && {
            ...current,
            phases: current.phases.map((phase) =>
              phase.id === project.phaseId
                ? { ...phase, projects: phase.projects.map((p) => (p.id === project.id ? { ...p, ...project } : p)) }
                : phase,
            ),
          },
      );
      toast.show(t("board.card.edited", { title: project.title }));
    },
  });
}

// Переназначение владельца — отдельный эндпоинт (Manager+, can('reassign','Project')), НЕ поле
// PATCH (decisions.md ADR "reassign — первоклассная операция"): ownerId определит scope в M6
// (visibility=ASSIGNED), поэтому это не косметика, а такая же по весу authz-операция, как move.
// Тот же двойной патч кэша, что useUpdateProject (project-detail обязателен, board best-effort).
export function useReassignProject(orgId: string, workspaceId: string, projectId: string) {
  const queryClient = useQueryClient();
  const { queryKey: projectKey } = projectQueryOptions(orgId, projectId);
  const { queryKey: boardKey } = boardQueryOptions(orgId, workspaceId);
  const t = useT();
  const toast = useToast();

  return useMutation({
    mutationFn: (input: ReassignProjectInput) =>
      request({
        method: "POST",
        path: `/v1/projects/${projectId}/reassign`,
        body: input,
        schema: projectResponseSchema,
      }),
    onError: (error) => {
      const kind = toBoardError(error);
      if (kind === "permissionDenied") void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      toast.error(t(errorKey(kind)));
    },
    onSuccess: (project: ProjectResponse) => {
      queryClient.setQueryData<ProjectResponse>(projectKey, project);
      queryClient.setQueryData<BoardResponse>(
        boardKey,
        (current) =>
          current && {
            ...current,
            phases: current.phases.map((phase) =>
              phase.id === project.phaseId
                ? { ...phase, projects: phase.projects.map((p) => (p.id === project.id ? { ...p, ...project } : p)) }
                : phase,
            ),
          },
      );
      toast.show(t("projectDetail.owner.reassigned"));
    },
  });
}
