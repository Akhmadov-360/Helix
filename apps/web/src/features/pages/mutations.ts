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
  type UpdatePageCommentInput,
  type UpdatePageInput,
} from "@helix/api-schemas";
import { queryKeys, request } from "../../shared/api";
import { useT, type MessageKey } from "../../shared/i18n";
import { toPageError } from "./page-error";
import { pageCommentsQueryOptions, pageQueryOptions, pageVersionsQueryOptions, projectPagesQueryOptions } from "./queries";

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

// §8 — restore не разрушительный (бэкенд сам снапшотит текущее состояние перед перезаписью), но
// UI всё равно спрашивает подтверждение (VersionHistoryDialog) — перезапись видимого контента
// без явного клика удивила бы пользователя, даже если технически отменяема через ту же историю.
export function useRestorePageVersion(orgId: string, projectId: string, pageId: string) {
  const queryClient = useQueryClient();
  const t = useT();

  return useMutation({
    mutationFn: (versionId: string) =>
      request({
        method: "POST",
        path: `/v1/pages/${pageId}/versions/${versionId}/restore`,
        schema: pageResponseSchema,
      }),
    onError: (error) => {
      const kind = toPageError(error);
      if (kind === "permissionDenied") void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      toast.error(t(pageErrorKey(kind)));
    },
    onSuccess: (page) => {
      queryClient.setQueryData(pageQueryOptions(orgId, pageId).queryKey, page);
      queryClient.setQueryData<PageResponse[]>(
        projectPagesQueryOptions(orgId, projectId).queryKey,
        (current) => current && current.map((p) => (p.id === page.id ? page : p)),
      );
      void queryClient.invalidateQueries({ queryKey: pageVersionsQueryOptions(orgId, pageId).queryKey });
      toast.success(t("pages.history.restoreSuccess"));
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

/** Локальная проекция: pending — комментарий ещё в полёте (оптимистично вставлен, id клиентский,
 *  не с бэка). Не часть pageCommentResponseSchema — это чисто клиентское состояние UI (#12). */
export type PendingPageComment = PageCommentResponse & { pending?: boolean };

// Раньше поле ввода очищалось сразу (MentionTextarea.onSubmit чистит контент синхронно), а
// комментарий появлялся в списке только на onSuccess — заметный зазор ощущался как "потерялось"
// (design review, #12). onMutate вставляет его немедленно с pending:true (иконка часов в UI),
// onSuccess подменяет ровно этот temp-id на реальный ответ сервера (не append второй раз).
export function useAddPageComment(orgId: string, pageId: string, me: { id: string; name: string }) {
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
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey });
      const snapshot = queryClient.getQueryData<PendingPageComment[]>(queryKey);
      const tempId = `temp-${crypto.randomUUID()}`;
      const optimistic: PendingPageComment = {
        id: tempId,
        pageId,
        authorId: me.id,
        authorName: me.name,
        body: input.body,
        createdAt: new Date().toISOString(),
        editedAt: null,
        pending: true,
      };
      queryClient.setQueryData<PendingPageComment[]>(queryKey, (current) => [...(current ?? []), optimistic]);
      return { snapshot, tempId };
    },
    onError: (error, _input, ctx) => {
      if (ctx?.snapshot) queryClient.setQueryData(queryKey, ctx.snapshot);
      const kind = toPageError(error);
      if (kind === "permissionDenied") void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      toast.error(t(pageErrorKey(kind)));
    },
    onSuccess: (comment, _input, ctx) => {
      queryClient.setQueryData<PendingPageComment[]>(queryKey, (current) =>
        (current ?? []).map((c) => (c.id === ctx?.tempId ? comment : c)),
      );
    },
  });
}

// Автор-only на бэке (строже delete) — сервер молча отклонит PATCH от не-автора 403'ей, кнопка
// "Изменить" в UI вообще не показывается не-автору (см. page-comments.tsx), это лишь второй слой.
export function useUpdatePageComment(orgId: string, pageId: string) {
  const queryClient = useQueryClient();
  const { queryKey } = pageCommentsQueryOptions(orgId, pageId);
  const t = useT();

  return useMutation({
    mutationFn: (vars: { commentId: string; input: UpdatePageCommentInput }) =>
      request({
        method: "PATCH",
        path: `/v1/pages/${pageId}/comments/${vars.commentId}`,
        body: vars.input,
        schema: pageCommentResponseSchema,
      }),
    onError: (error) => {
      const kind = toPageError(error);
      if (kind === "permissionDenied") void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      toast.error(t(pageErrorKey(kind)));
    },
    onSuccess: (comment) => {
      queryClient.setQueryData<PendingPageComment[]>(
        queryKey,
        (current) => current && current.map((c) => (c.id === comment.id ? comment : c)),
      );
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
