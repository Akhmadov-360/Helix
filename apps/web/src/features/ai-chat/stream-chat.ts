import { aiStreamEventSchema, type AiStreamEvent } from "@helix/api-schemas";
import { streamRequest } from "../../shared/api";

// ai-chat.md §13.5 — граница доверия = сеть (§6.2): каждый SSE-блок валидируется той же Zod-схемой,
// что и обычные ответы, просто по одному объекту на событие, не на весь ответ разом. Событие, не
// прошедшее схему, пропускается (не рвёт весь стрим одним плохим кадром — сосед по потоку читаем).
export async function* streamAiMessage(threadId: string, content: string, signal?: AbortSignal): AsyncGenerator<AiStreamEvent, void> {
  const raw = streamRequest({ path: `/v1/ai-threads/${threadId}/messages`, body: { content }, signal });
  for await (const event of raw) {
    const parsed = aiStreamEventSchema.safeParse(event);
    if (parsed.success) yield parsed.data;
  }
}
