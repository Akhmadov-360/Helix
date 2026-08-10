import { Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { MAINTENANCE_QUEUE } from "../../core/queue/queue.module";
import { S3Service } from "../../core/storage/s3.service";
import { AttachmentsRepository } from "../attachments/attachments.repository";
import { ATTACHMENT_CLEANUP_JOB, type AttachmentCleanupJobData } from "./attachment-cleanup-job";
import {
  ATTACHMENT_UPLOAD_CLEANUP_JOB,
  ATTACHMENT_UPLOAD_CLEANUP_RETENTION_HOURS,
} from "./attachment-upload-cleanup-job";
import { INVITE_CLEANUP_JOB, INVITE_RETENTION_DAYS } from "./invite-cleanup-job";
import { InviteCleanupRepository } from "./invite-cleanup.repository";
import { REFRESH_SESSION_CLEANUP_JOB, REFRESH_SESSION_RETENTION_DAYS } from "./refresh-session-cleanup-job";
import { RefreshSessionCleanupRepository } from "./refresh-session-cleanup.repository";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Одна очередь `maintenance`, несколько job-имён — тот же приём, что EmailWorker (§1
 * notifications.md): process() диспетчерит по job.name, а не заводит Processor на каждое имя
 * (два @Processor на одну очередь означали бы два независимых BullMQ-воркера, конкурирующих за
 * ВСЕ джобы очереди без фильтра по имени — не то, что нужно).
 *
 * Диспетч — явный if/else по каждому известному имени с ошибкой по умолчанию, НЕ
 * if(X) ... else (Y-по-умолчанию): последнее было корректно ровно при двух job-именах и молча
 * замаскировало бы баг при добавлении третьего (новое имя тихо попало бы в ветку "иначе").
 */
@Processor(MAINTENANCE_QUEUE)
export class MaintenanceWorker extends WorkerHost {
  private readonly logger = new Logger(MaintenanceWorker.name);

  constructor(
    private readonly refreshSessions: RefreshSessionCleanupRepository,
    private readonly invites: InviteCleanupRepository,
    private readonly attachments: AttachmentsRepository,
    private readonly s3: S3Service,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case REFRESH_SESSION_CLEANUP_JOB:
        return this.processRefreshSessionCleanup();
      case INVITE_CLEANUP_JOB:
        return this.processInviteCleanup();
      case ATTACHMENT_CLEANUP_JOB:
        return this.processAttachmentCleanup(job.data as AttachmentCleanupJobData);
      case ATTACHMENT_UPLOAD_CLEANUP_JOB:
        return this.processAttachmentUploadCleanup();
      default:
        throw new Error(`MaintenanceWorker: unknown job name "${job.name}"`);
    }
  }

  private async processRefreshSessionCleanup(): Promise<void> {
    const cutoff = new Date(Date.now() - REFRESH_SESSION_RETENTION_DAYS * DAY_MS);
    const deleted = await this.refreshSessions.deleteStale(cutoff);
    this.logger.log(`${REFRESH_SESSION_CLEANUP_JOB}: deleted ${deleted} row(s) dead before ${cutoff.toISOString()}`);
  }

  private async processInviteCleanup(): Promise<void> {
    const cutoff = new Date(Date.now() - INVITE_RETENTION_DAYS * DAY_MS);
    const deleted = await this.invites.deleteStale(cutoff);
    this.logger.log(`${INVITE_CLEANUP_JOB}: deleted ${deleted} row(s) dead before ${cutoff.toISOString()}`);
  }

  // files.md §6 — batch-удаление объектов Project'а, удалённого целиком; строки Attachment уже
  // мертвы (каскад БД), эта джоба чистит только S3, не БД.
  private async processAttachmentCleanup(data: AttachmentCleanupJobData): Promise<void> {
    await this.s3.deleteObjects(data.storageKeys);
    this.logger.log(`${ATTACHMENT_CLEANUP_JOB}: deleted ${data.storageKeys.length} S3 object(s)`);
  }

  // files.md §6.1 — неподтверждённые загрузки старше cutoff: объект (best-effort, мог не
  // существовать вовсе) + строка.
  private async processAttachmentUploadCleanup(): Promise<void> {
    const cutoff = new Date(Date.now() - ATTACHMENT_UPLOAD_CLEANUP_RETENTION_HOURS * HOUR_MS);
    const stale = await this.attachments.findStaleUnconfirmed(cutoff);
    for (const row of stale) {
      try {
        await this.s3.deleteObject(row.storageKey);
      } catch {
        // best-effort (files.md §6.1): объект мог никогда не появиться в S3 (клиент так и не
        // залил файл) — отсутствие объекта не должно мешать убрать саму строку.
      }
    }
    const deleted = await this.attachments.deleteMany(stale.map((row) => row.id));
    this.logger.log(`${ATTACHMENT_UPLOAD_CLEANUP_JOB}: deleted ${deleted} row(s) dead before ${cutoff.toISOString()}`);
  }
}
