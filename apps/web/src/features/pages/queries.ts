import { queryOptions } from "@tanstack/react-query";
import { pageCommentListResponseSchema, pageListResponseSchema, pageResponseSchema } from "@helix/api-schemas";
import { queryKeys, request } from "../../shared/api";

export function projectPagesQueryOptions(orgId: string, projectId: string) {
  return queryOptions({
    queryKey: queryKeys.projectPages(orgId, projectId),
    queryFn: () => request({ path: `/v1/projects/${projectId}/pages`, schema: pageListResponseSchema }),
  });
}

export function pageQueryOptions(orgId: string, pageId: string) {
  return queryOptions({
    queryKey: queryKeys.page(orgId, pageId),
    queryFn: () => request({ path: `/v1/pages/${pageId}`, schema: pageResponseSchema }),
  });
}

export function pageCommentsQueryOptions(orgId: string, pageId: string) {
  return queryOptions({
    queryKey: queryKeys.pageComments(orgId, pageId),
    queryFn: () => request({ path: `/v1/pages/${pageId}/comments`, schema: pageCommentListResponseSchema }),
  });
}
