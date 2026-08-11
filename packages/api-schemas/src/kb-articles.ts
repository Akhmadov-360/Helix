import { z } from "zod";
import { pageContentSchema } from "./pages";

// docs/specs/pages-kb.md §5.
export const kbArticleTagSchema = z.string().trim().min(1).max(50);
export const kbArticleTagsSchema = z.array(kbArticleTagSchema).max(20);

export const createKbArticleSchema = z.object({
  workspaceId: z.string().optional(), // не задан = org-wide (§1)
  title: z.string().trim().min(1).max(255),
  content: pageContentSchema.optional(),
  tags: kbArticleTagsSchema.optional(),
});
export type CreateKbArticleInput = z.infer<typeof createKbArticleSchema>;

export const updateKbArticleSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  content: pageContentSchema.optional(),
  tags: kbArticleTagsSchema.optional(),
});
export type UpdateKbArticleInput = z.infer<typeof updateKbArticleSchema>;

// §7 — GET /v1/kb-articles?workspaceId=&tag=&q=
export const listKbArticlesQuerySchema = z.object({
  workspaceId: z.string().optional(),
  tag: z.string().trim().min(1).optional(),
  q: z.string().trim().min(1).optional(),
});
export type ListKbArticlesQuery = z.infer<typeof listKbArticlesQuerySchema>;

export const kbArticleResponseSchema = z.object({
  id: z.string(),
  workspaceId: z.string().nullable(),
  title: z.string(),
  content: z.record(z.string(), z.unknown()),
  tags: z.array(z.string()),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type KbArticleResponse = z.infer<typeof kbArticleResponseSchema>;

export const kbArticleListResponseSchema = z.array(kbArticleResponseSchema);
export type KbArticleListResponse = z.infer<typeof kbArticleListResponseSchema>;
