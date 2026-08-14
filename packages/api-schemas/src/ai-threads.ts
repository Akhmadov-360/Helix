import { z } from "zod";
import { toolCallSchema } from "./ai-tools";

// ai-chat.md §1.2 — ADR (decisions.md): scope на 3 уровня сразу, Фаза 1 использует только PROJECT.
export const aiThreadScopeSchema = z.enum(["PROJECT", "WORKSPACE", "ORG"]);
export type AiThreadScope = z.infer<typeof aiThreadScopeSchema>;

// ai-chat.md §1.1 — источники retrieval-чанков; переиспользуется и для Citation.sourceType.
export const embeddingSourceTypeSchema = z.enum(["PAGE", "KB_ARTICLE", "ATTACHMENT"]);
export type EmbeddingSourceType = z.infer<typeof embeddingSourceTypeSchema>;

export const messageRoleSchema = z.enum(["USER", "ASSISTANT"]);
export type MessageRole = z.infer<typeof messageRoleSchema>;

// Снапшот (P2), не живая ссылка — ai-chat.md §1.3: источник цитаты может исчезнуть/измениться
// ПОСЛЕ ответа, label хранится как видел юзер в момент ответа.
export const citationSchema = z.object({
  sourceType: embeddingSourceTypeSchema,
  sourceId: z.string(),
  label: z.string(),
});
export type Citation = z.infer<typeof citationSchema>;

export const createAiMessageSchema = z.object({
  content: z.string().trim().min(1).max(4000),
});
export type CreateAiMessageInput = z.infer<typeof createAiMessageSchema>;

export const aiThreadResponseSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  scope: aiThreadScopeSchema,
  projectId: z.string().nullable(),
  workspaceId: z.string().nullable(),
  title: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type AiThreadResponse = z.infer<typeof aiThreadResponseSchema>;

export const aiThreadListResponseSchema = z.array(aiThreadResponseSchema);
export type AiThreadListResponse = z.infer<typeof aiThreadListResponseSchema>;

export const aiMessageResponseSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  role: messageRoleSchema,
  content: z.string(),
  citations: z.array(citationSchema).nullable(),
  toolCalls: z.array(toolCallSchema).nullable(),
  createdAt: z.iso.datetime(),
});
export type AiMessageResponse = z.infer<typeof aiMessageResponseSchema>;

export const aiMessageListResponseSchema = z.array(aiMessageResponseSchema);
export type AiMessageListResponse = z.infer<typeof aiMessageListResponseSchema>;
