import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { Prisma, type EmbeddingSourceType } from "@helix/db";
import { PrismaService } from "../../core/prisma/prisma.service";

export interface EmbeddingChunkInsert {
  orgId: string;
  projectId: string | null;
  workspaceId: string | null;
  sourceType: EmbeddingSourceType;
  sourceId: string;
  chunkIndex: number;
  content: string;
  embedding: number[];
}

export interface RetrievedChunk {
  id: string;
  sourceType: EmbeddingSourceType;
  sourceId: string;
  content: string;
  similarity: number;
}

@Injectable()
export class EmbeddingChunkRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ai-chat.md §3.2 — delete-before-reinsert, не upsert по chunkIndex (число чанков меняется между
  // версиями контента). Вызывающий код (ingest-embeddings.worker.ts) держит обе операции в ОДНОЙ
  // транзакции — сначала delete, потом createMany.
  async deleteBySource(sourceType: EmbeddingSourceType, sourceId: string, tx?: Prisma.TransactionClient): Promise<void> {
    await (tx ?? this.prisma.client).embeddingChunk.deleteMany({ where: { sourceType, sourceId } });
  }

  // code review: EmbeddingChunk НЕ FK-каскадится от Project (§1.1 ai-chat.md — сознательно, не
  // недосмотр), а Page/Attachment каскадятся от Project на уровне БД (ON DELETE CASCADE) в обход
  // сервисного remove()/delete(), который иначе почистил бы чанки по sourceId. Без этого метода
  // удаление Project оставляло бы чанки удалённых Page/Attachment сиротами навсегда — они
  // всплыли бы в WORKSPACE/ORG-scope retrieval (Фаза 2), в обход того, что проект уже не существует.
  async deleteByProject(projectId: string, tx?: Prisma.TransactionClient): Promise<void> {
    await (tx ?? this.prisma.client).embeddingChunk.deleteMany({ where: { projectId } });
  }

  /**
   * `embedding` — `Unsupported("vector(1536)")` в schema.prisma (CLAUDE.md manual point #8):
   * generated Client НЕ умеет писать/фильтровать это поле через create()/update() ни при каких
   * обстоятельствах (не наш выбор — сам тип в Prisma), поэтому запись только через raw SQL, вектор
   * сериализуется вручную в pgvector-литерал ("[0.1,0.2,...]"). id — randomUUID(), не Prisma-шный
   * cuid(): последний генерируется самим Client'ом на create(), которым мы здесь не пользуемся;
   * колонка — обычный TEXT без формат-constraint'а на уровне БД, любая уникальная строка валидна.
   */
  // code review: было по одному $executeRaw INSERT на чанк в цикле — документ на пару десятков
  // чанков держал бы транзакцию (и её локи) открытой на N sequential round-trip'ов подряд.
  // Один multi-row INSERT — тот же итог, один round-trip, не per-chunk.
  async createMany(rows: EmbeddingChunkInsert[], tx?: Prisma.TransactionClient): Promise<void> {
    if (rows.length === 0) return;
    const client = tx ?? this.prisma.client;
    const values = Prisma.join(
      rows.map(
        (row) =>
          Prisma.sql`(${randomUUID()}, ${row.orgId}, ${row.projectId}, ${row.workspaceId}, ${row.sourceType}::"EmbeddingSourceType", ${row.sourceId}, ${row.chunkIndex}, ${row.content}, ${`[${row.embedding.join(",")}]`}::vector, now())`,
      ),
    );
    await client.$executeRaw`
      INSERT INTO "EmbeddingChunk" (id, "orgId", "projectId", "workspaceId", "sourceType", "sourceId", "chunkIndex", content, embedding, "createdAt")
      VALUES ${values}
    `;
  }

  /**
   * ai-chat.md §2 — retrieval для scope=PROJECT: Page/Attachment чанки фильтруются по
   * projectId треда, KBArticle чанки — по workspaceId проекта (org-wide KB — workspaceId IS NULL —
   * видна из любого проекта той орги, тот же принцип видимости, что у KB вне AI). orgId — на
   * каждом уровне (§2 "не только на верхнем"), даже когда projectId технически уже сужает до
   * тенанта: EmbeddingChunk не incentive под composite-FK backbone.
   *
   * Cosine distance (`<=>`, pgvector) — вектор сериализуется в тот же текстовый литерал, что
   * createMany(). similarity = 1 - distance (0..1, выше = ближе) — удобнее для порога/логов,
   * чем сырое distance (0=идентично, растёт без верхней границы для несвязанных векторов).
   */
  async searchProjectScope(
    orgId: string,
    projectId: string,
    workspaceId: string,
    queryEmbedding: number[],
    topK: number,
  ): Promise<RetrievedChunk[]> {
    const vectorLiteral = `[${queryEmbedding.join(",")}]`;
    return this.prisma.client.$queryRaw<RetrievedChunk[]>`
      SELECT id, "sourceType", "sourceId", content,
             1 - (embedding <=> ${vectorLiteral}::vector) AS similarity
      FROM "EmbeddingChunk"
      WHERE "orgId" = ${orgId}
        AND (
          "projectId" = ${projectId}
          OR ("sourceType" = 'KB_ARTICLE' AND ("workspaceId" = ${workspaceId} OR "workspaceId" IS NULL))
        )
      ORDER BY embedding <=> ${vectorLiteral}::vector ASC
      LIMIT ${topK}
    `;
  }
}
