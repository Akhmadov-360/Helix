import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { activityEventResponseSchema, projectResponseSchema } from "@helix/api-schemas";
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
