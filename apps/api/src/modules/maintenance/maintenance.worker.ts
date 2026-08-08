import { Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { MAINTENANCE_QUEUE } from "../../core/queue/queue.module";
import { INVITE_CLEANUP_JOB, INVITE_RETENTION_DAYS } from "./invite-cleanup-job";
import { InviteCleanupRepository } from "./invite-cleanup.repository";
import { REFRESH_SESSION_CLEANUP_JOB, REFRESH_SESSION_RETENTION_DAYS } from "./refresh-session-cleanup-job";
import { RefreshSessionCleanupRepository } from "./refresh-session-cleanup.repository";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Одна очередь `maintenance`, несколько job-имён — тот же приём, что EmailWorker (§1
 * notifications.md): process() диспетчерит по job.name, а не заводит Processor на каждое имя
 * (два @Processor на одну очередь означали бы два независимых BullMQ-воркера, конкурирующих за
 * ВСЕ джобы очереди без фильтра по имени — не то, что нужно).
 */
@Processor(MAINTENANCE_QUEUE)
export class MaintenanceWorker extends WorkerHost {
  private readonly logger = new Logger(MaintenanceWorker.name);

  constructor(
    private readonly refreshSessions: RefreshSessionCleanupRepository,
    private readonly invites: InviteCleanupRepository,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === INVITE_CLEANUP_JOB) {
      return this.processInviteCleanup();
    }
    return this.processRefreshSessionCleanup();
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
}
