import { z } from "zod";

// docs/specs/files.md §4 — лимит размера, единственный источник (Zod-схема ниже И клиентская
// проверка на фронте переиспользуют эту константу). Не env — часть контракта приложения, как
// MAX_LOGO_FILE_BYTES в organizations.ts.
export const MAX_ATTACHMENT_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

// files.md §4 (доп.) — суммарный объём подтверждённых вложений одного проекта. Фиксированная
// константа для этого прохода; когда появится тарификация аккаунта владельца, эта цифра станет
// производной от плана организации (см. решение при обсуждении фичи) — сейчас нет ни одного поля
// тарифа в домене, вводить его сейчас было бы спекулятивной структурой.
export const PROJECT_STORAGE_QUOTA_BYTES = 250 * 1024 * 1024; // 250 MB

// §3, шаг 1 — выдача presigned PUT URL. sizeBytes — заявленный клиентом, ранний UX-отказ (не
// единственная граница размера, см. §3/§4 — реальный размер сверяется на confirm).
export const createUploadUrlSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(127),
  sizeBytes: z.number().int().positive().max(MAX_ATTACHMENT_SIZE_BYTES),
});
export type CreateUploadUrlInput = z.infer<typeof createUploadUrlSchema>;

export const uploadUrlResponseSchema = z.object({
  attachmentId: z.string(),
  uploadUrl: z.string(),
  storageKey: z.string(),
});
export type UploadUrlResponse = z.infer<typeof uploadUrlResponseSchema>;

// §10 — storageKey НЕ входит: внутренняя деталь реализации, фронт работает через attachmentId.
export const attachmentResponseSchema = z.object({
  id: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number(),
  scanStatus: z.enum(["SKIPPED", "CLEAN", "INFECTED"]),
  uploadedByName: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type AttachmentResponse = z.infer<typeof attachmentResponseSchema>;

export const attachmentListResponseSchema = z.array(attachmentResponseSchema);
export type AttachmentListResponse = z.infer<typeof attachmentListResponseSchema>;

export const downloadUrlResponseSchema = z.object({ downloadUrl: z.string() });
export type DownloadUrlResponse = z.infer<typeof downloadUrlResponseSchema>;

// §5 — inline = предпросмотр в диалоге (рендерится в браузере), attachment = реальное скачивание
// (Content-Disposition форсирует Save As на стороне S3, не клиентский download-атрибут).
export const downloadUrlQuerySchema = z.object({
  disposition: z.enum(["inline", "attachment"]).optional(),
});
export type DownloadUrlQuery = z.infer<typeof downloadUrlQuerySchema>;

// §7 (пересмотрено) — filename редактируется: скриншоты/фото часто сохраняются с неосмысленными
// именами, переименование через приложение дешевле, чем "удали и перезалей заново".
export const updateAttachmentSchema = z.object({
  filename: z.string().trim().min(1).max(255),
});
export type UpdateAttachmentInput = z.infer<typeof updateAttachmentSchema>;

// §4 (доп.) — использование квоты проекта, для полоски прогресса на фронте.
export const storageUsageResponseSchema = z.object({
  usedBytes: z.number(),
  quotaBytes: z.number(),
});
export type StorageUsageResponse = z.infer<typeof storageUsageResponseSchema>;
