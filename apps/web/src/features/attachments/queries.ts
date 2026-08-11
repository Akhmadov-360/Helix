import { queryOptions } from "@tanstack/react-query";
import { attachmentListResponseSchema } from "@helix/api-schemas";
import { queryKeys, request } from "../../shared/api";

export function projectAttachmentsQueryOptions(orgId: string, projectId: string) {
  return queryOptions({
    queryKey: queryKeys.projectAttachments(orgId, projectId),
    queryFn: () => request({ path: `/v1/projects/${projectId}/attachments`, schema: attachmentListResponseSchema }),
  });
}
