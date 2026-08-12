import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import {
  pageCommentResponseSchema,
  pageResponseSchema,
  type CreatePageCommentInput,
  type CreatePageInput,
  type PageCommentResponse,
  type PageResponse,
  type UpdatePageInput,
} from "@helix/api-schemas";
import { queryKeys, request } from "../../shared/api";
import { useT, type MessageKey } from "../../shared/i18n";
import { toPageError } from "./page-error";
import { pageCommentsQueryOptions, pageQueryOptions, projectPagesQueryOptions } from "./queries";

function pageErrorKey(kind: ReturnType<typeof toPageError>): MessageKey {
  switch (kind) {
    case "permissionDenied":
      return "pages.error.permissionDenied";
    case "notFound":
      return "pages.error.notFound";
    default:
      return "pages.error.unexpected";
  }
}

export function useCreatePage(orgId: string, projectId: string) {
  const queryClient = useQueryClient();
  const { queryKey } = projectPagesQueryOptions(orgId, projectId);
  const t = useT();

  return useMutation({
    mutationFn: (input: CreatePageInput) =>
      request({ method: "POST", path: `/v1/projects/${projectId}/pages`, body: input, schema: pageResponseSchema }),
    onError: (error) => {
      const kind = toPageError(error);
      if (kind === "permissionDenied") void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      toast.error(t(pageErrorKey(kind)));
    },
    onSuccess: (page) => {
      queryClient.setQueryData<PageResponse[]>(queryKey, (current) => [...(current ?? []), page]);
    },
  });
}

// files.md-style debounced autosave (pages-kb.md §3) — PATCH принимает частичный { title?, content? }.
// Инвалидируем список (заголовок мог поменяться), обновляем кэш одиночной страницы напрямую.
export function useUpdatePage(orgId: string, projectId: string, pageId: string) {
  const queryClient = useQueryClient();
  const { queryKey } = pageQueryOptions(orgId, pageId);
  const t = useT();

  return useMutation({
    mutationFn: (input: UpdatePageInput) =>
      request({ method: "PATCH", path: `/v1/pages/${pageId}`, body: input, schema: pageResponseSchema }),
    onError: (error) => {
      const kind = toPageError(error);
      if (kind === "permissionDenied") void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      toast.error(t(pageErrorKey(kind)));
    },
    onSuccess: (page) => {
      queryClient.setQueryData(queryKey, page);
      queryClient.setQueryData<PageResponse[]>(
        projectPagesQueryOptions(orgId, projectId).queryKey,
        (current) => current && current.map((p) => (p.id === page.id ? page : p)),
      );
    },
  });
}

export function useDeletePage(orgId: string, projectId: string) {
  const queryClient = useQueryClient();
  const { queryKey } = projectPagesQueryOptions(orgId, projectId);
  const t = useT();

  return useMutation({
    mutationFn: (vars: { pageId: string }) =>
      request({ method: "DELETE", path: `/v1/pages/${vars.pageId}`, schema: z.null() }),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey });
      const snapshot = queryClient.getQueryData<PageResponse[]>(queryKey);
      queryClient.setQueryData<PageResponse[]>(queryKey, (current) => current && current.filter((p) => p.id !== vars.pageId));
      return { snapshot };
    },
    onError: (error, _vars, ctx) => {
      if (ctx?.snapshot) queryClient.setQueryData(queryKey, ctx.snapshot);
      const kind = toPageError(error);
      if (kind === "permissionDenied") void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      toast.error(t(pageErrorKey(kind)));
    },
    onSuccess: () => {
      toast.success(t("pages.delete.success"));
    },
  });
}

export function useAddPageComment(orgId: string, pageId: string) {
  const queryClient = useQueryClient();
  const { queryKey } = pageCommentsQueryOptions(orgId, pageId);
  const t = useT();

  return useMutation({
    mutationFn: (input: CreatePageCommentInput) =>
      request({
        method: "POST",
        path: `/v1/pages/${pageId}/comments`,
        body: input,
        schema: pageCommentResponseSchema,
      }),
    onError: (error) => {
      const kind = toPageError(error);
      if (kind === "permissionDenied") void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      toast.error(t(pageErrorKey(kind)));
    },
    onSuccess: (comment) => {
      queryClient.setQueryData<PageCommentResponse[]>(queryKey, (current) => [...(current ?? []), comment]);
    },
  });
}

export function useDeletePageComment(orgId: string, pageId: string) {
  const queryClient = useQueryClient();
  const { queryKey } = pageCommentsQueryOptions(orgId, pageId);
  const t = useT();

  return useMutation({
    mutationFn: (vars: { commentId: string }) =>
      request({ method: "DELETE", path: `/v1/pages/${pageId}/comments/${vars.commentId}`, schema: z.null() }),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey });
      const snapshot = queryClient.getQueryData<PageCommentResponse[]>(queryKey);
      queryClient.setQueryData<PageCommentResponse[]>(
        queryKey,
        (current) => current && current.filter((c) => c.id !== vars.commentId),
      );
      return { snapshot };
    },
    onError: (error, _vars, ctx) => {
      if (ctx?.snapshot) queryClient.setQueryData(queryKey, ctx.snapshot);
      const kind = toPageError(error);
      if (kind === "permissionDenied") void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      toast.error(t(pageErrorKey(kind)));
    },
  });
}
