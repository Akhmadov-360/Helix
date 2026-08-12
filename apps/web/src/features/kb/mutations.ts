import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import {
  kbArticleResponseSchema,
  type CreateKbArticleInput,
  type KbArticleResponse,
  type UpdateKbArticleInput,
} from "@helix/api-schemas";
import { queryKeys, request } from "../../shared/api";
import { useT, type MessageKey } from "../../shared/i18n";
import { toKbError } from "./kb-error";
import { kbArticleQueryOptions } from "./queries";

function kbErrorKey(kind: ReturnType<typeof toKbError>): MessageKey {
  switch (kind) {
    case "permissionDenied":
      return "kb.error.permissionDenied";
    case "notFound":
      return "kb.error.notFound";
    default:
      return "kb.error.unexpected";
  }
}

// Список KB — множество разных query-key'ев (по фильтрам q/tag/workspaceId), нет единого queryKey
// для точечного patch как у projectAttachments/projectPages; проще инвалидировать весь namespace
// ["org", orgId, "kbArticles"] широким match'ем, чем перебирать все возможные комбинации фильтров.
function invalidateKbLists(queryClient: ReturnType<typeof useQueryClient>, orgId: string) {
  void queryClient.invalidateQueries({ queryKey: ["org", orgId, "kbArticles"] });
}

export function useCreateKbArticle(orgId: string) {
  const queryClient = useQueryClient();
  const t = useT();

  return useMutation({
    mutationFn: (input: CreateKbArticleInput) =>
      request({ method: "POST", path: "/v1/kb-articles", body: input, schema: kbArticleResponseSchema }),
    onError: (error) => {
      const kind = toKbError(error);
      if (kind === "permissionDenied") void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      toast.error(t(kbErrorKey(kind)));
    },
    onSuccess: () => invalidateKbLists(queryClient, orgId),
  });
}

export function useUpdateKbArticle(orgId: string, articleId: string) {
  const queryClient = useQueryClient();
  const { queryKey } = kbArticleQueryOptions(orgId, articleId);
  const t = useT();

  return useMutation({
    mutationFn: (input: UpdateKbArticleInput) =>
      request({ method: "PATCH", path: `/v1/kb-articles/${articleId}`, body: input, schema: kbArticleResponseSchema }),
    onError: (error) => {
      const kind = toKbError(error);
      if (kind === "permissionDenied") void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      toast.error(t(kbErrorKey(kind)));
    },
    onSuccess: (article) => {
      queryClient.setQueryData<KbArticleResponse>(queryKey, article);
      invalidateKbLists(queryClient, orgId);
    },
  });
}

export function useDeleteKbArticle(orgId: string) {
  const queryClient = useQueryClient();
  const t = useT();

  return useMutation({
    mutationFn: (vars: { articleId: string }) =>
      request({ method: "DELETE", path: `/v1/kb-articles/${vars.articleId}`, schema: z.null() }),
    onError: (error) => {
      const kind = toKbError(error);
      if (kind === "permissionDenied") void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      toast.error(t(kbErrorKey(kind)));
    },
    onSuccess: () => {
      invalidateKbLists(queryClient, orgId);
      toast.success(t("kb.delete.success"));
    },
  });
}
