import { queryOptions } from "@tanstack/react-query";
import { workspaceResponseSchema } from "@helix/api-schemas";
import { queryKeys, request } from "../../shared/api";

export function workspaceQueryOptions(orgId: string, workspaceId: string) {
  return queryOptions({
    queryKey: queryKeys.workspace(orgId, workspaceId),
    queryFn: () => request({ path: `/v1/workspaces/${workspaceId}`, schema: workspaceResponseSchema }),
  });
}
