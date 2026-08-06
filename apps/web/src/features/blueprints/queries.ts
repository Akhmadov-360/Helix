import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { blueprintResponseSchema, type Audience } from "@helix/api-schemas";
import { queryKeys, request } from "../../shared/api";

const blueprintListResponseSchema = z.array(blueprintResponseSchema);

export function blueprintsQueryOptions(orgId: string, audience?: Audience) {
  return queryOptions({
    queryKey: queryKeys.blueprints(orgId, { audience }),
    queryFn: () =>
      request({
        path: "/v1/blueprints",
        searchParams: audience ? { audience } : undefined,
        schema: blueprintListResponseSchema,
      }),
  });
}
