import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import {
  attachmentResponseSchema,
  downloadUrlResponseSchema,
  uploadUrlResponseSchema,
  type AttachmentResponse,
  type CreateUploadUrlInput,
  type UpdateAttachmentInput,
} from "@helix/api-schemas";
import { queryKeys, request } from "../../shared/api";
import { useT, type MessageKey } from "../../shared/i18n";
import { toAttachmentError } from "./attachment-error";
import { projectAttachmentsQueryOptions } from "./queries";

function attachmentErrorKey(kind: ReturnType<typeof toAttachmentError>): MessageKey {
  switch (kind) {
    case "permissionDenied":
      return "attachments.error.permissionDenied";
    case "notFound":
      return "attachments.error.notFound";
    case "tooLarge":
      return "attachments.error.tooLarge";
    case "uploadNotConfirmed":
      return "attachments.error.uploadNotConfirmed";
    default:
      return "attachments.error.unexpected";
  }
}

// files.md §3, шаг 2 — direct-to-S3 PUT. Не через shared/api#request: то не JSON, ответа-конверта
// нет, а прогресс нужен во время самой загрузки — fetch() не даёт upload-прогресс, только XHR.
function putToStorage(url: string, file: File, onProgress: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed with status ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(file);
  });
}

// files.md §3 — 3 шага одной пользовательской операции (upload-url → PUT → confirm), один
// useMutation. onProgress передаётся через переменные mutate() (не через состояние хука) — так
// компонент ведёт свой прогресс-бар per-file, а не полагается на isPending одного общего инстанса
// (несколько файлов грузятся параллельно — по одному mutate() на файл).
export function useUploadAttachment(orgId: string, projectId: string) {
  const queryClient = useQueryClient();
  const { queryKey } = projectAttachmentsQueryOptions(orgId, projectId);
  const t = useT();

  return useMutation({
    mutationFn: async (vars: { file: File; onProgress: (percent: number) => void }): Promise<AttachmentResponse> => {
      const { file, onProgress } = vars;
      const input: CreateUploadUrlInput = {
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
      };
      const created = await request({
        method: "POST",
        path: `/v1/projects/${projectId}/attachments/upload-url`,
        body: input,
        schema: uploadUrlResponseSchema,
      });
      await putToStorage(created.uploadUrl, file, onProgress);
      return request({
        method: "POST",
        path: `/v1/projects/${projectId}/attachments/${created.attachmentId}/confirm`,
        schema: attachmentResponseSchema,
      });
    },
    onError: (error) => {
      const kind = toAttachmentError(error);
      if (kind === "permissionDenied") void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      toast.error(t(attachmentErrorKey(kind)));
    },
    onSuccess: (attachment) => {
      queryClient.setQueryData<AttachmentResponse[]>(queryKey, (current) => [attachment, ...(current ?? [])]);
      toast.success(t("attachments.upload.success", { filename: attachment.filename }));
    },
  });
}

export function useDeleteAttachment(orgId: string, projectId: string) {
  const queryClient = useQueryClient();
  const { queryKey } = projectAttachmentsQueryOptions(orgId, projectId);
  const t = useT();

  return useMutation({
    mutationFn: (vars: { attachmentId: string }) =>
      request({
        method: "DELETE",
        path: `/v1/projects/${projectId}/attachments/${vars.attachmentId}`,
        schema: z.null(),
      }),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey });
      const snapshot = queryClient.getQueryData<AttachmentResponse[]>(queryKey);
      queryClient.setQueryData<AttachmentResponse[]>(
        queryKey,
        (current) => current && current.filter((a) => a.id !== vars.attachmentId),
      );
      return { snapshot };
    },
    onError: (error, _vars, ctx) => {
      if (ctx?.snapshot) queryClient.setQueryData(queryKey, ctx.snapshot);
      const kind = toAttachmentError(error);
      if (kind === "permissionDenied") void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      toast.error(t(attachmentErrorKey(kind)));
    },
    onSuccess: () => {
      toast.success(t("attachments.delete.success"));
    },
  });
}

// Скачивание — короткоживущий presigned GET (files.md §5), запрашивается по клику, не хранится
// в кэше query (устареет за секунды). disposition="inline" — предпросмотр в диалоге (рендерится
// в браузере), "attachment" (default) — реальное скачивание (Content-Disposition форсирует Save
// As на стороне S3, см. code-review "Download открывал файл в табе вместо скачивания").
export async function fetchDownloadUrl(
  projectId: string,
  attachmentId: string,
  disposition: "inline" | "attachment" = "attachment",
): Promise<string> {
  const res = await request({
    path: `/v1/projects/${projectId}/attachments/${attachmentId}/download-url`,
    searchParams: { disposition },
    schema: downloadUrlResponseSchema,
  });
  return res.downloadUrl;
}

// files.md §7 (пересмотрено) — переименование, только filename.
export function useUpdateAttachmentFilename(orgId: string, projectId: string) {
  const queryClient = useQueryClient();
  const { queryKey } = projectAttachmentsQueryOptions(orgId, projectId);
  const t = useT();

  return useMutation({
    mutationFn: (vars: { attachmentId: string; input: UpdateAttachmentInput }) =>
      request({
        method: "PATCH",
        path: `/v1/projects/${projectId}/attachments/${vars.attachmentId}`,
        body: vars.input,
        schema: attachmentResponseSchema,
      }),
    onError: (error) => {
      const kind = toAttachmentError(error);
      if (kind === "permissionDenied") void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      toast.error(t(attachmentErrorKey(kind)));
    },
    onSuccess: (attachment) => {
      queryClient.setQueryData<AttachmentResponse[]>(
        queryKey,
        (current) => current && current.map((a) => (a.id === attachment.id ? attachment : a)),
      );
      toast.success(t("attachments.rename.success"));
    },
  });
}
