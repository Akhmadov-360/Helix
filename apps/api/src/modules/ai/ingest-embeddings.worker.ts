import { Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import type { EmbeddingSourceType } from "@helix/db";
import { chunkBlocks, splitIntoBlocks } from "../../core/lib/chunk-text";
import { extractBlockTexts } from "../../core/lib/full-text-search";
import { INGEST_EMBEDDINGS_QUEUE } from "../../core/queue/queue.module";
import { PrismaService } from "../../core/prisma/prisma.service";
import { S3Service } from "../../core/storage/s3.service";
import { AttachmentsRepository } from "../attachments/attachments.repository";
import { KbRepository } from "../kb/kb.repository";
import { PagesRepository } from "../pages/pages.repository";
import { AiProviderService } from "./ai-provider.service";
import { EmbeddingChunkRepository } from "./embedding-chunk.repository";
import type { IngestEmbeddingsJobData } from "./ingest-embeddings-job";
import { extractAttachmentText, isExtractableMimeType } from "./text-extraction";

// ai-chat.md §3.2 — extract → chunk → embed → upsert. delete+insert в ОДНОЙ транзакции (§3.2:
// "Transaction: DELETE ...; INSERT новые чанки") — источник никогда не виден с частичным/пустым
// набором чанков между двумя отдельными операциями.
// drainDelay: см. email.worker.ts. Индексация страницы/KB на минуту позже сохранения не влияет
// на UX (RAG-поиск не real-time — пользователь не бежит спрашивать AI в ту же секунду).
@Processor(INGEST_EMBEDDINGS_QUEUE, { drainDelay: 60 })
export class IngestEmbeddingsWorker extends WorkerHost {
  private readonly logger = new Logger(IngestEmbeddingsWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chunks: EmbeddingChunkRepository,
    private readonly pages: PagesRepository,
    private readonly kb: KbRepository,
    private readonly attachments: AttachmentsRepository,
    private readonly s3: S3Service,
    private readonly aiProvider: AiProviderService,
  ) {
    super();
  }

  async process(job: Job<IngestEmbeddingsJobData>): Promise<void> {
    const { orgId, sourceType, sourceId, projectId, workspaceId } = job.data;

    const blocks = await this.extractBlocks(orgId, sourceType, sourceId, projectId);
    // null — источник исчез между enqueue и обработкой (удалён), или неизвлекаемый формат/файл
    // без текста. Не ошибка джобы — тихо no-op, старые чанки (если были) чистит следующий ветвь.
    if (blocks === null) {
      this.logger.log(`${sourceType}:${sourceId} — no extractable content, skipping ingest`);
      return;
    }

    const textChunks = chunkBlocks(blocks);
    if (textChunks.length === 0) {
      await this.chunks.deleteBySource(sourceType, sourceId);
      return;
    }

    const embeddingProvider = await this.aiProvider.getEmbeddingProvider(orgId);
    const vectors = await embeddingProvider.embed(textChunks);
    if (vectors.length !== textChunks.length) {
      throw new Error(`Embedding provider returned ${vectors.length} vectors for ${textChunks.length} chunks`);
    }

    await this.prisma.client.$transaction(async (tx) => {
      await this.chunks.deleteBySource(sourceType, sourceId, tx);
      await this.chunks.createMany(
        textChunks.map((content, chunkIndex) => {
          const embedding = vectors[chunkIndex];
          // Длины уже сверены выше — недостижимо в норме; узкий guard вместо non-null assertion,
          // чтобы TS не терял тип, а рантайм не мог тихо вставить undefined как embedding.
          if (!embedding) throw new Error(`Missing embedding vector at index ${chunkIndex}`);
          return { orgId, projectId, workspaceId, sourceType, sourceId, chunkIndex, content, embedding };
        }),
        tx,
      );
    });
    this.logger.log(`${sourceType}:${sourceId} — ingested ${textChunks.length} chunk(s)`);
  }

  private async extractBlocks(
    orgId: string,
    sourceType: EmbeddingSourceType,
    sourceId: string,
    projectId: string | null,
  ): Promise<string[] | null> {
    switch (sourceType) {
      case "PAGE": {
        const page = await this.pages.findById(sourceId, orgId);
        if (!page) return null;
        return [page.title, ...extractBlockTexts(page.content)];
      }
      case "KB_ARTICLE": {
        const article = await this.kb.findById(sourceId, orgId);
        if (!article) return null;
        return [article.title, ...extractBlockTexts(article.content)];
      }
      case "ATTACHMENT": {
        // projectId обязателен для Attachment (files.md) — job data его всегда несёт для этого
        // sourceType (см. триггер в attachments.service.ts); null здесь означает баг вызывающего
        // кода, не легитимное состояние — трактуем как "источник недоступен", не бросаем 500.
        if (!projectId) return null;
        const attachment = await this.attachments.findById(sourceId, orgId, projectId);
        if (!attachment || !isExtractableMimeType(attachment.mimeType)) return null;
        const buffer = await this.s3.getObjectBuffer(attachment.storageKey);
        const text = await extractAttachmentText(attachment.mimeType, buffer);
        return text ? splitIntoBlocks(text) : [];
      }
    }
  }
}
