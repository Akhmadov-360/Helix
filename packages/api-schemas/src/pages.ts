import { z } from "zod";

// docs/specs/pages-kb.md §5 — лимит на TipTap/ProseMirror JSON-документ. Не типизируем content
// построчно (P3: бэкенд не источник истины по форме rich-контента, см. врезка в спеке) — только
// z.record (валидный JSON-объект) + лимит РЕАЛЬНОГО байтового размера.
export const MAX_CONTENT_JSON_BYTES = 256 * 1024; // 256 KB

// Ручной подсчёт UTF-8 байт, не `Buffer.byteLength`/`TextEncoder` — этот пакет шарится с фронтом
// (apps/web импортирует схемы для форм валидации), а ни `Buffer` (Node-глобал), ни типы
// `TextEncoder` не доступны здесь без лишней зависимости (нет `@types/node`, lib — ES2022 без DOM).
// `for...of` по строке идёт по code points (не UTF-16 code units) — переживает суррогатные пары
// (§5 врезка: `.length` строки занижает байтовый размер кириллического контента вдвое).
export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const char of value) {
    const codePoint = char.codePointAt(0) ?? 0;
    if (codePoint <= 0x7f) bytes += 1;
    else if (codePoint <= 0x7ff) bytes += 2;
    else if (codePoint <= 0xffff) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

export const pageContentSchema = z
  .record(z.string(), z.unknown())
  .refine((value) => utf8ByteLength(JSON.stringify(value)) <= MAX_CONTENT_JSON_BYTES, {
    message: `content превышает лимит ${MAX_CONTENT_JSON_BYTES} байт (UTF-8)`,
  });
export type PageContent = z.infer<typeof pageContentSchema>;

export const createPageSchema = z.object({
  title: z.string().trim().min(1).max(255),
  content: pageContentSchema.optional(),
});
export type CreatePageInput = z.infer<typeof createPageSchema>;

export const updatePageSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  content: pageContentSchema.optional(),
});
export type UpdatePageInput = z.infer<typeof updatePageSchema>;

export const pageResponseSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string(),
  content: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type PageResponse = z.infer<typeof pageResponseSchema>;

export const pageListResponseSchema = z.array(pageResponseSchema);
export type PageListResponse = z.infer<typeof pageListResponseSchema>;

// §8 (доп.) — GET /v1/projects/:projectId/pages?q= — полнотекстовый поиск по title+content
// (Page.searchText, CLAUDE.md manual-migration point #6). Пусто/не задан = обычный список.
export const listPagesQuerySchema = z.object({
  q: z.string().trim().min(1).optional(),
});
export type ListPagesQuery = z.infer<typeof listPagesQuerySchema>;

// §2 — mentionedUserIds: фронт резолвит "@Имя" → id (ростер участников), бэкенд не парсит текст.
export const createPageCommentSchema = z.object({
  body: z.string().trim().min(1).max(5000),
  mentionedUserIds: z.array(z.string()).max(50).optional(),
});
export type CreatePageCommentInput = z.infer<typeof createPageCommentSchema>;

// Редактирование текста — только автор (не Manager+, в отличие от delete): менять чужие слова —
// не то же самое, что убрать их, тот же принцип, что Slack/Discord/Telegram.
export const updatePageCommentSchema = z.object({
  body: z.string().trim().min(1).max(5000),
});
export type UpdatePageCommentInput = z.infer<typeof updatePageCommentSchema>;

export const pageCommentResponseSchema = z.object({
  id: z.string(),
  pageId: z.string(),
  authorId: z.string().nullable(),
  authorName: z.string().nullable(),
  body: z.string(),
  createdAt: z.iso.datetime(),
  editedAt: z.iso.datetime().nullable(),
});
export type PageCommentResponse = z.infer<typeof pageCommentResponseSchema>;

export const pageCommentListResponseSchema = z.array(pageCommentResponseSchema);
export type PageCommentListResponse = z.infer<typeof pageCommentListResponseSchema>;

// pages-kb.md §8 — только метаданные (id/title/createdAt), без content (P3): список версий не
// должен тащить полный TipTap-документ на каждую строку истории, content нужен только при restore
// (сервер сам применяет его, фронт не читает content конкретной версии напрямую).
export const pageVersionResponseSchema = z.object({
  id: z.string(),
  pageId: z.string(),
  title: z.string(),
  createdAt: z.iso.datetime(),
});
export type PageVersionResponse = z.infer<typeof pageVersionResponseSchema>;

export const pageVersionListResponseSchema = z.array(pageVersionResponseSchema);
export type PageVersionListResponse = z.infer<typeof pageVersionListResponseSchema>;
