import { queryOptions } from "@tanstack/react-query";
import { archivedProjectListResponseSchema, boardResponseSchema } from "@helix/api-schemas";
import { queryKeys, request } from "../../shared/api";

// M1: без пагинации/virtualization (не профилировано как нужное, §7) — один запрос, дефолтный лимит.
const DEFAULT_LIMIT_PER_PHASE = 50;

export function boardQueryOptions(orgId: string, workspaceId: string, limitPerPhase = DEFAULT_LIMIT_PER_PHASE) {
  return queryOptions({
    queryKey: queryKeys.board(orgId, workspaceId, limitPerPhase),
    queryFn: () =>
      request({
        path: `/v1/workspaces/${workspaceId}/board`,
        searchParams: { limitPerPhase },
        schema: boardResponseSchema,
      }),
  });
}

export function archivedProjectsQueryOptions(orgId: string, workspaceId: string) {
  return queryOptions({
    queryKey: queryKeys.archivedProjects(orgId, workspaceId),
    queryFn: () =>
      request({
        path: `/v1/workspaces/${workspaceId}/projects/archived`,
        schema: archivedProjectListResponseSchema,
      }),
  });
}
