import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { fieldDefinitionResponseSchema } from "@helix/api-schemas";
import { queryKeys, request } from "../../shared/api";

const fieldListResponseSchema = z.array(fieldDefinitionResponseSchema);

export function fieldsQueryOptions(orgId: string, workspaceId: string) {
  return queryOptions({
    queryKey: queryKeys.fields(orgId, workspaceId),
    queryFn: () =>
      request({ path: `/v1/workspaces/${workspaceId}/fields`, schema: fieldListResponseSchema }),
  });
}
