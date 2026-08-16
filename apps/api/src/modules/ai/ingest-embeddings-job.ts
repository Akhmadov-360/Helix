import type { EmbeddingSourceType } from "@helix/db";

export const INGEST_EMBEDDINGS_JOB = "ingest.embeddings";

// ai-chat.md §3.1 — enqueue'ится ПОСЛЕ коммита транзакции (P4), не внутри неё. projectId/
// workspaceId переданы явно (не перевычисляются в воркере) — триггер их и так знает в момент
// enqueue, экономит поход в БД перед самим извлечением текста.
export interface IngestEmbeddingsJobData {
  orgId: string;
  sourceType: EmbeddingSourceType;
  sourceId: string;
  projectId: string | null;
  workspaceId: string | null;
}

// Тот же паттерн, что EMAIL_JOB_OPTIONS (notifications.service.ts) — внешний API-вызов
// (embedding-провайдер) может транзиентно упасть (rate limit/timeout), retry с backoff уместен.
export const INGEST_EMBEDDINGS_JOB_OPTIONS = { attempts: 5, backoff: { type: "exponential" as const, delay: 30_000 } };
