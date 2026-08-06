import { Injectable, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { EMAIL_QUEUE } from "../../core/queue/queue.module";
import { LEAD_CREATED_JOB, type LeadCreatedJobData } from "./lead-created-job";
import { PASSWORD_RESET_JOB, type PasswordResetJobData } from "./password-reset-job";

// §6: 5 попыток, экспоненциально от 30с (~30с/1мин/2мин/4мин/8мин) — покрывает транзиентные
// отказы мейлера без агрессивного долбления. Исчерпал попытки → BullMQ failed-set (DLQ v1).
const EMAIL_JOB_OPTIONS = { attempts: 5, backoff: { type: "exponential" as const, delay: 30_000 } };

export type EmailJobData = LeadCreatedJobData | PasswordResetJobData;

/**
 * Тонкий фасад над BullMQ `Queue` (§1). Вызывается ПОСЛЕ коммита транзакции/записи создателем
 * события (ProjectsService.create, PasswordResetService.requestReset) — сам enqueue не участвует
 * в транзакции и не должен её провалить, если бросит (§2, P4-порядок): это ответственность
 * вызывающего кода, не этого сервиса.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(@InjectQueue(EMAIL_QUEUE) private readonly emailQueue: Queue<EmailJobData>) {}

  async enqueueLeadCreated(data: LeadCreatedJobData): Promise<void> {
    try {
      await this.emailQueue.add(LEAD_CREATED_JOB, data, EMAIL_JOB_OPTIONS);
    } catch (err) {
      // §2 принятый остаточный риск: лид уже создан и закоммичен, письмо — вторично.
      // Падение enqueue не должно всплыть в ответ API создателю лида.
      this.logger.error(`Failed to enqueue lead.created for project ${data.projectId}`, err instanceof Error ? err.stack : err);
    }
  }

  async enqueuePasswordReset(data: PasswordResetJobData): Promise<void> {
    try {
      await this.emailQueue.add(PASSWORD_RESET_JOB, data, EMAIL_JOB_OPTIONS);
    } catch (err) {
      // Токен уже записан в БД и действителен час — юзер может запросить письмо повторно;
      // падение enqueue не должно всплыть в ответ /forgot-password (тот и так всегда 200).
      this.logger.error("Failed to enqueue password.reset", err instanceof Error ? err.stack : err);
    }
  }
}
