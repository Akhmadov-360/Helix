import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { activityEventResponseSchema, projectAssigneeResponseSchema, projectResponseSchema } from "@helix/api-schemas";
import { queryKeys, request } from "../../shared/api";

export function projectQueryOptions(orgId: string, projectId: string) {
  return queryOptions({
    queryKey: queryKeys.project(orgId, projectId),
    queryFn: () => request({ path: `/v1/projects/${projectId}`, schema: projectResponseSchema }),
  });
}

const activityListSchema = z.array(activityEventResponseSchema);

export function projectActivityQueryOptions(orgId: string, projectId: string) {
  return queryOptions({
    queryKey: queryKeys.projectActivity(orgId, projectId),
    queryFn: () =>
      request({ path: `/v1/projects/${projectId}/activity`, schema: activityListSchema }),
  });
}

// Co-workers (redesign: переехало из вкладки Контакты в персистентный сайдбар — видно на любой
// вкладке, не только своей).
const projectAssigneeListSchema = z.array(projectAssigneeResponseSchema);

export function projectAssigneesQueryOptions(orgId: string, projectId: string) {
  return queryOptions({
    queryKey: queryKeys.projectAssignees(orgId, projectId),
    queryFn: () => request({ path: `/v1/projects/${projectId}/assignees`, schema: projectAssigneeListSchema }),
  });
}
