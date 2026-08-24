import { Injectable, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { EMAIL_QUEUE } from "../../core/queue/queue.module";
import { ASSIGNMENT_JOB, type AssignmentJobData } from "./assignment-job";
import { LEAD_CREATED_JOB, type LeadCreatedJobData } from "./lead-created-job";
import { MENTION_JOB, type MentionJobData } from "./mention-job";
import { ORG_INVITE_JOB, type OrgInviteJobData } from "./org-invite-job";
import { PASSWORD_RESET_JOB, type PasswordResetJobData } from "./password-reset-job";
import { PHASE_CHANGED_JOB, type PhaseChangedJobData } from "./phase-changed-job";
import { TASK_ASSIGNED_JOB, type TaskAssignedJobData } from "./task-assigned-job";

// §6: 5 попыток, экспоненциально от 30с (~30с/1мин/2мин/4мин/8мин) — покрывает транзиентные
// отказы мейлера без агрессивного долбления. Исчерпал попытки → BullMQ failed-set (DLQ v1).
const EMAIL_JOB_OPTIONS = { attempts: 5, backoff: { type: "exponential" as const, delay: 30_000 } };

export type EmailJobData =
  | LeadCreatedJobData
  | PasswordResetJobData
  | AssignmentJobData
  | PhaseChangedJobData
  | OrgInviteJobData
  | MentionJobData
  | TaskAssignedJobData;

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

  async enqueueAssignment(data: AssignmentJobData): Promise<void> {
    try {
      await this.emailQueue.add(ASSIGNMENT_JOB, data, EMAIL_JOB_OPTIONS);
    } catch (err) {
      // Назначение уже закоммичено — письмо вторично, тот же остаточный риск, что lead.created.
      this.logger.error(`Failed to enqueue project.assigned for project ${data.projectId}`, err instanceof Error ? err.stack : err);
    }
  }

  async enqueuePhaseChanged(data: PhaseChangedJobData): Promise<void> {
    try {
      await this.emailQueue.add(PHASE_CHANGED_JOB, data, EMAIL_JOB_OPTIONS);
    } catch (err) {
      this.logger.error(`Failed to enqueue project.phase_changed for project ${data.projectId}`, err instanceof Error ? err.stack : err);
    }
  }

  async enqueueOrgInvite(data: OrgInviteJobData): Promise<void> {
    try {
      await this.emailQueue.add(ORG_INVITE_JOB, data, EMAIL_JOB_OPTIONS);
    } catch (err) {
      // Инвайт уже записан в БД и действителен 7 дней — админ может нажать «Resend» повторно;
      // падение enqueue не должно всплыть в ответ POST /organizations/invites.
      this.logger.error(`Failed to enqueue org.invite for ${data.email}`, err instanceof Error ? err.stack : err);
    }
  }

  /**
   * Вызывается ПОСЛЕ коммита создания/обновления таска, только когда assigneeId появился/сменился
   * и назначен НЕ сам actor (self-assign не спамим — юзер сам себе назначил, знает что назначил).
   * Дедупликация по taskId в jobId: перезапись поля assigneeId в течение короткого окна не должна
   * плодить дубли писем; EmailWorker всё равно рефетчит свежий assigneeId и не шлёт если разошлись.
   */
  async enqueueTaskAssigned(data: TaskAssignedJobData): Promise<void> {
    try {
      await this.emailQueue.add(TASK_ASSIGNED_JOB, data, {
        ...EMAIL_JOB_OPTIONS,
        jobId: `task-assigned:${data.taskId}:${data.assigneeId}`,
      });
    } catch (err) {
      // Таск уже в БД, письмо вторично — тот же остаточный риск, что project.assigned.
      this.logger.error(
        `Failed to enqueue task.assigned for task ${data.taskId}`,
        err instanceof Error ? err.stack : err,
      );
    }
  }

  /** pages-kb.md §2 — вызывается после коммита создания PageComment, по одному job на упомянутого. */
  async enqueueMention(data: MentionJobData): Promise<void> {
    try {
      await this.emailQueue.add(MENTION_JOB, data, EMAIL_JOB_OPTIONS);
    } catch (err) {
      // Комментарий уже закоммичен — письмо вторично, тот же остаточный риск, что project.assigned.
      this.logger.error(`Failed to enqueue page.mention for page ${data.pageId}`, err instanceof Error ? err.stack : err);
    }
  }
}
