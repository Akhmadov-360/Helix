import { Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { MAINTENANCE_QUEUE } from "../../core/queue/queue.module";
import { ATTACHMENT_CLEANUP_JOB, type AttachmentCleanupJobData } from "../maintenance/attachment-cleanup-job";

/**
 * files.md §6 — вызывается ProjectsService ПОСЛЕ удаления Project (ключи прочитаны ДО каскада,
 * см. ProjectsService.remove). Отдельный маленький producer, не прямой @InjectQueue в
 * ProjectsService — та же причина, что NotificationsService не размазан по вызывающим модулям.
 */
@Injectable()
export class AttachmentCleanupProducer {
  constructor(@InjectQueue(MAINTENANCE_QUEUE) private readonly queue: Queue) {}

  async enqueueProjectCleanup(storageKeys: string[]): Promise<void> {
    if (storageKeys.length === 0) return;
    const data: AttachmentCleanupJobData = { storageKeys };
    await this.queue.add(ATTACHMENT_CLEANUP_JOB, data);
  }
}
