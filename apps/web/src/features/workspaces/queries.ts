import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { workspaceResponseSchema } from "@helix/api-schemas";
import { queryKeys, request } from "../../shared/api";

// Список воркспейсов меняют редко (admin-действие), не через drag/live-редактирование — дольше
// базового staleTime (query-client.ts) безопасно; create/delete уже патчат кэш напрямую (mutations.ts).
export function workspacesQueryOptions(orgId: string) {
  return queryOptions({
    queryKey: queryKeys.workspaces(orgId),
    queryFn: () => request({ path: "/v1/workspaces", schema: z.array(workspaceResponseSchema) }),
    staleTime: 120_000,
  });
}
