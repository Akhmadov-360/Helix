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

// ai-chat.md §4/§13.5 — SSE wire-формат POST /v1/ai-threads/:id/messages. Единственный источник
// истины и для apps/api (AiThreadsService.streamChat), и для apps/web (парсинг "data: {...}\n\n"
// блоков) — до этой схемы формат был только TS-типом внутри apps/api, фронт дублировал бы его
// вручную без рантайм-проверки на границе сети (§6.2 apps/web — граница доверия = сеть).
export const aiStreamEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text_delta"), text: z.string() }),
  z.object({ type: z.literal("tool_call_proposed"), id: z.string(), tool: z.string(), args: z.record(z.string(), z.unknown()) }),
  z.object({ type: z.literal("done") }),
  z.object({ type: z.literal("error"), message: z.string() }),
  // §13.5: одно финальное событие с уже сохранённым Message (citations/toolCalls) — фронту не
  // нужен отдельный round-trip за только что написанным ответом.
  z.object({ type: z.literal("message_saved"), message: aiMessageResponseSchema }),
]);
export type AiStreamEvent = z.infer<typeof aiStreamEventSchema>;
