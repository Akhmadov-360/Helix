import { z } from "zod";

// docs/specs/files.md §4 — лимит размера, единственный источник (Zod-схема ниже И клиентская
// проверка на фронте переиспользуют эту константу). Не env — часть контракта приложения, как
// MAX_LOGO_FILE_BYTES в organizations.ts.
export const MAX_ATTACHMENT_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

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
