import { Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { INGEST_EMBEDDINGS_QUEUE } from "../../core/queue/queue.module";
import { INGEST_EMBEDDINGS_JOB, INGEST_EMBEDDINGS_JOB_OPTIONS, type IngestEmbeddingsJobData } from "./ingest-embeddings-job";

// ai-chat.md §3.1 — единственная точка enqueue, вызывается ПОСЛЕ коммита транзакции из
// PagesService/KbService/AttachmentsService (P4: сайд-эффект после мутации, не внутри неё).
@Injectable()
export class IngestEmbeddingsProducer {
  constructor(@InjectQueue(INGEST_EMBEDDINGS_QUEUE) private readonly queue: Queue) {}

  async enqueue(data: IngestEmbeddingsJobData): Promise<void> {
    await this.queue.add(INGEST_EMBEDDINGS_JOB, data, INGEST_EMBEDDINGS_JOB_OPTIONS);
  }
}
