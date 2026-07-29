import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { workspaceResponseSchema } from "@helix/api-schemas";
import { queryKeys, request } from "../../shared/api";

export function workspacesQueryOptions(orgId: string) {
  return queryOptions({
    queryKey: queryKeys.workspaces(orgId),
    queryFn: () => request({ path: "/v1/workspaces", schema: z.array(workspaceResponseSchema) }),
  });
}
