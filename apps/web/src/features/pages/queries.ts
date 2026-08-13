import { queryOptions } from "@tanstack/react-query";
import {
  pageCommentListResponseSchema,
  pageListResponseSchema,
  pageResponseSchema,
  pageVersionListResponseSchema,
} from "@helix/api-schemas";
import { queryKeys, request } from "../../shared/api";

export function projectPagesQueryOptions(orgId: string, projectId: string, q?: string) {
  return queryOptions({
    queryKey: queryKeys.projectPages(orgId, projectId, q),
    queryFn: () =>
      request({ path: `/v1/projects/${projectId}/pages`, searchParams: { q }, schema: pageListResponseSchema }),
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

// pages-kb.md §8 — метаданные версий (без content, P3); открывается по клику на "История", не
// suspense — не должно блокировать рендер страницы.
export function pageVersionsQueryOptions(orgId: string, pageId: string) {
  return queryOptions({
    queryKey: queryKeys.pageVersions(orgId, pageId),
    queryFn: () => request({ path: `/v1/pages/${pageId}/versions`, schema: pageVersionListResponseSchema }),
  });
}
