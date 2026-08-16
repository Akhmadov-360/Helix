-- CLAUDE.md manual-migration point #8: pgvector extension + HNSW-индекс на EmbeddingChunk.embedding.
-- Prisma не выражает ни CREATE EXTENSION, ни vector-индексы — raw SQL, `prisma migrate dev` не
-- должен их перегенерить/уронить.

CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "EmbeddingSourceType" AS ENUM ('PAGE', 'KB_ARTICLE', 'ATTACHMENT');
CREATE TYPE "AiThreadScope" AS ENUM ('PROJECT', 'WORKSPACE', 'ORG');
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateTable
CREATE TABLE "EmbeddingChunk" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "projectId" TEXT,
    "workspaceId" TEXT,
    "sourceType" "EmbeddingSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(1536) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmbeddingChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmbeddingChunk_orgId_projectId_idx" ON "EmbeddingChunk"("orgId", "projectId");
CREATE INDEX "EmbeddingChunk_orgId_workspaceId_idx" ON "EmbeddingChunk"("orgId", "workspaceId");
CREATE INDEX "EmbeddingChunk_sourceType_sourceId_idx" ON "EmbeddingChunk"("sourceType", "sourceId");

-- Manual-migration point #8 (продолжение): HNSW, не ivfflat — не требует предварительного объёма
-- данных для разумного качества (ivfflat нужен ANALYZE после наполнения). vector_cosine_ops —
-- similarity search в query-пайплайне использует cosine distance (ai-chat.md §4). Параметры
-- по умолчанию (m=16, ef_construction=64) — пересмотреть по объёму данных при реализации ingest,
-- не раньше (не тюнить индекс под нулевые данные).
CREATE INDEX "EmbeddingChunk_embedding_hnsw_idx" ON "EmbeddingChunk" USING hnsw ("embedding" vector_cosine_ops);

-- AddForeignKey
ALTER TABLE "EmbeddingChunk" ADD CONSTRAINT "EmbeddingChunk_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "AiThread" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "scope" "AiThreadScope" NOT NULL,
    "projectId" TEXT,
    "workspaceId" TEXT,
    "createdById" TEXT,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiThread_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiThread_orgId_projectId_idx" ON "AiThread"("orgId", "projectId");
CREATE INDEX "AiThread_orgId_workspaceId_idx" ON "AiThread"("orgId", "workspaceId");

-- AddForeignKey
ALTER TABLE "AiThread" ADD CONSTRAINT "AiThread_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Composite-FK, резолвится только когда projectId задан (партиальный MATCH SIMPLE — тот же
-- паттерн, что Project.company/KBArticle.workspace) — гарантирует project.orgId == thread.orgId.
ALTER TABLE "AiThread" ADD CONSTRAINT "AiThread_projectId_orgId_fkey" FOREIGN KEY ("projectId", "orgId") REFERENCES "Project"("id", "orgId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiThread" ADD CONSTRAINT "AiThread_workspaceId_orgId_fkey" FOREIGN KEY ("workspaceId", "orgId") REFERENCES "Workspace"("id", "orgId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiThread" ADD CONSTRAINT "AiThread_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "citations" JSONB,
    "toolCalls" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Message_threadId_createdAt_idx" ON "Message"("threadId", "createdAt");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "AiThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
