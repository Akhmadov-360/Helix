import { Module, type OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { MAINTENANCE_QUEUE } from "../../core/queue/queue.module";
import { AttachmentsModule } from "../attachments/attachments.module";
import {
  ATTACHMENT_UPLOAD_CLEANUP_JOB,
  ATTACHMENT_UPLOAD_CLEANUP_REPEAT_OPTIONS,
} from "./attachment-upload-cleanup-job";
import { INVITE_CLEANUP_JOB, INVITE_CLEANUP_REPEAT_OPTIONS } from "./invite-cleanup-job";
import { InviteCleanupRepository } from "./invite-cleanup.repository";
import { MaintenanceWorker } from "./maintenance.worker";
import {
  REFRESH_SESSION_CLEANUP_JOB,
  REFRESH_SESSION_CLEANUP_REPEAT_OPTIONS,
} from "./refresh-session-cleanup-job";
import { RefreshSessionCleanupRepository } from "./refresh-session-cleanup.repository";

/**
 * Repeatable-джобы обслуживания. RefreshSession копился без границы, т.к. до M2 в apps/api не
 * было BullMQ вообще — теперь она есть под email, и это уже второй/третий потребитель той же
 * инфры (project-refresh-session-cleanup, invites.md §11), не повод заводить очередь ради одной
 * задачи каждый раз.
 *
 * Регистрация repeat-джоб в OnModuleInit, не через отдельный CLI/скрипт: BullMQ дедуплицирует
 * repeatable-джобы по (name, repeat-опции, jobId) — повторный add() при каждом рестарте
 * приложения не плодит дубликаты, а просто подтверждает то же расписание.
 */
// AttachmentsModule — за AttachmentsRepository (§6.1, upload-cleanup). ATTACHMENT_CLEANUP_JOB
// (§6, project-delete) сюда НЕ регистрируется repeatable — это одноразовая джоба на конкретное
// событие, её добавляет AttachmentCleanupProducer, не OnModuleInit.
@Module({
  imports: [AttachmentsModule],
  providers: [RefreshSessionCleanupRepository, InviteCleanupRepository, MaintenanceWorker],
})
export class MaintenanceModule implements OnModuleInit {
  constructor(@InjectQueue(MAINTENANCE_QUEUE) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    await this.queue.add(
      REFRESH_SESSION_CLEANUP_JOB,
      {},
      { repeat: REFRESH_SESSION_CLEANUP_REPEAT_OPTIONS, jobId: REFRESH_SESSION_CLEANUP_JOB },
    );
    await this.queue.add(
      INVITE_CLEANUP_JOB,
      {},
      { repeat: INVITE_CLEANUP_REPEAT_OPTIONS, jobId: INVITE_CLEANUP_JOB },
    );
    await this.queue.add(
      ATTACHMENT_UPLOAD_CLEANUP_JOB,
      {},
      { repeat: ATTACHMENT_UPLOAD_CLEANUP_REPEAT_OPTIONS, jobId: ATTACHMENT_UPLOAD_CLEANUP_JOB },
    );
  }
}
