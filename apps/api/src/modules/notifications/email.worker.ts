import { Inject, Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import type { Env } from "@helix/config";
import { ENV } from "../../core/config/config.module";
import { EMAIL_QUEUE } from "../../core/queue/queue.module";
import { MAILER, type MailerService } from "./mailer/mailer.interface";
import { NotificationsRepository } from "./notifications.repository";
import { resolveLeadCreatedRecipients } from "./recipients";
import { renderLeadCreatedEmail } from "./templates/lead-created-email";
import type { LeadCreatedJobData } from "./lead-created-job";

/**
 * Консьюмер очереди `email` (§1). Живёт в том же Nest-приложении, не отдельным процессом —
 * на масштабе Helix выделенный worker добавил бы деплой-сложность без выгоды (§1).
 */
@Processor(EMAIL_QUEUE)
export class EmailWorker extends WorkerHost {
  private readonly logger = new Logger(EmailWorker.name);

  constructor(
    private readonly repo: NotificationsRepository,
    @Inject(MAILER) private readonly mailer: MailerService,
    @Inject(ENV) private readonly env: Env,
  ) {
    super();
  }

  async process(job: Job<LeadCreatedJobData>): Promise<void> {
    const { orgId, projectId } = job.data;

    // §3 defensive re-check: чужой orgId по ошибке → не отправляем, логируем как ошибку
    // (это баг вызывающего кода, не штатное состояние), не ретраим бесконечно молча.
    const context = await this.repo.findLeadCreatedContext(orgId, projectId);
    if (!context) {
      this.logger.error(`lead.created: project ${projectId} not found in org ${orgId}`);
      return;
    }

    const recipients = resolveLeadCreatedRecipients(context.workspaceSettings, context.ownerEmail, context.assigneeEmails);
    if (recipients === null) return; // §4: блюпринт явно выключил письма — тихо, не лог
    if (recipients.length === 0) {
      // §4: owner явно обнулён + assignees пусты — «лид в пуле», не сбой.
      this.logger.log(`lead.created: no recipients for project ${projectId}, skipping`);
      return;
    }

    const email = renderLeadCreatedEmail({ projectId, projectTitle: context.title, appUrl: this.env.APP_URL });
    await this.mailer.send({ to: recipients, ...email });
  }
}
