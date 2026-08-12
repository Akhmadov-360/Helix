import { queryOptions } from "@tanstack/react-query";
import { attachmentListResponseSchema, storageUsageResponseSchema } from "@helix/api-schemas";
import { queryKeys, request } from "../../shared/api";

export function projectAttachmentsQueryOptions(orgId: string, projectId: string) {
  return queryOptions({
    queryKey: queryKeys.projectAttachments(orgId, projectId),
    queryFn: () => request({ path: `/v1/projects/${projectId}/attachments`, schema: attachmentListResponseSchema }),
  });
}

// files.md §4 (доп.) — полоска использования квоты, отдельный лёгкий запрос (не часть списка).
export function projectStorageUsageQueryOptions(orgId: string, projectId: string) {
  return queryOptions({
    queryKey: queryKeys.projectStorageUsage(orgId, projectId),
    queryFn: () =>
      request({ path: `/v1/projects/${projectId}/attachments/storage-usage`, schema: storageUsageResponseSchema }),
  });
}
