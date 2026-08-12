import { queryOptions } from "@tanstack/react-query";
import { kbArticleListResponseSchema, kbArticleResponseSchema } from "@helix/api-schemas";
import { queryKeys, request } from "../../shared/api";

export interface KbArticlesQuery {
  workspaceId?: string;
  tag?: string;
  q?: string;
  [key: string]: string | undefined;
}

export function kbArticlesQueryOptions(orgId: string, query: KbArticlesQuery = {}) {
  return queryOptions({
    queryKey: queryKeys.kbArticles(orgId, query),
    queryFn: () => request({ path: "/v1/kb-articles", searchParams: query, schema: kbArticleListResponseSchema }),
  });
}

export function kbArticleQueryOptions(orgId: string, articleId: string) {
  return queryOptions({
    queryKey: queryKeys.kbArticle(orgId, articleId),
    queryFn: () => request({ path: `/v1/kb-articles/${articleId}`, schema: kbArticleResponseSchema }),
  });
}
