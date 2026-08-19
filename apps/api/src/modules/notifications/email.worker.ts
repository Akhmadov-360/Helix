import { Inject, Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import type { Env } from "@helix/config";
import { ENV } from "../../core/config/config.module";
import { EMAIL_QUEUE } from "../../core/queue/queue.module";
import { MAILER, type MailerService } from "./mailer/mailer.interface";
import { NotificationsRepository } from "./notifications.repository";
import { resolveLeadCreatedRecipients } from "./recipients";
import { renderAssignmentEmail } from "./templates/assignment-email";
import { renderLeadCreatedEmail } from "./templates/lead-created-email";
import { renderMentionEmail } from "./templates/mention-email";
import { renderOrgInviteEmail } from "./templates/org-invite-email";
import { renderPasswordResetEmail } from "./templates/password-reset-email";
import { renderPhaseChangedEmail } from "./templates/phase-changed-email";
import { ASSIGNMENT_JOB, type AssignmentJobData } from "./assignment-job";
import type { LeadCreatedJobData } from "./lead-created-job";
import { MENTION_JOB, type MentionJobData } from "./mention-job";
import { ORG_INVITE_JOB, type OrgInviteJobData } from "./org-invite-job";
import { PASSWORD_RESET_JOB, type PasswordResetJobData } from "./password-reset-job";
import { PHASE_CHANGED_JOB, type PhaseChangedJobData } from "./phase-changed-job";

type EmailJobData =
  | LeadCreatedJobData
  | PasswordResetJobData
  | AssignmentJobData
  | PhaseChangedJobData
  | OrgInviteJobData
  | MentionJobData;

/**
 * Консьюмер очереди `email` (§1). Живёт в том же Nest-приложении, не отдельным процессом —
 * на масштабе Helix выделенный worker добавил бы деплой-сложность без выгоды (§1).
 *
 * Одна очередь, несколько job-имён (§1 «webhooks/embeddings получат имена здесь же») —
 * process() диспетчерит по job.name, а не заводит Processor на каждое имя: они делят
 * одну и ту же Redis-очередь/конкурентность, отдельный класс на письмо плодил бы
 * DI-boilerplate без выгоды.
 */
// drainDelay: 5с-дефолт BullMQ означает опрос Redis каждые 5с даже на пустой очереди — на
// always-on воркере это основная статья расхода Redis-команд (Upstash считает их поштучно), а не
// реальные джобы. 60с задержка на пустой очереди — письмо-приглашение уходит максимум на минуту
// позже, не критично; на непустой очереди задержки нет вовсе (BullMQ поднимает next job сразу).
@Processor(EMAIL_QUEUE, { drainDelay: 60 })
export class EmailWorker extends WorkerHost {
  private readonly logger = new Logger(EmailWorker.name);

  constructor(
    private readonly repo: NotificationsRepository,
    @Inject(MAILER) private readonly mailer: MailerService,
    @Inject(ENV) private readonly env: Env,
  ) {
    super();
  }

  async process(job: Job<EmailJobData>): Promise<void> {
    if (job.name === PASSWORD_RESET_JOB) {
      return this.processPasswordReset(job.data as PasswordResetJobData);
    }
    if (job.name === ASSIGNMENT_JOB) {
      return this.processAssignment(job.data as AssignmentJobData);
    }
    if (job.name === PHASE_CHANGED_JOB) {
      return this.processPhaseChanged(job.data as PhaseChangedJobData);
    }
    if (job.name === ORG_INVITE_JOB) {
      return this.processOrgInvite(job.data as OrgInviteJobData);
    }
    if (job.name === MENTION_JOB) {
      return this.processMention(job.data as MentionJobData);
    }
    return this.processLeadCreated(job.data as LeadCreatedJobData);
  }

  private async processLeadCreated(data: LeadCreatedJobData): Promise<void> {
    const { orgId, projectId } = data;

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

  private async processPasswordReset(data: PasswordResetJobData): Promise<void> {
    const email = renderPasswordResetEmail({ name: data.name, token: data.token, appUrl: this.env.APP_URL });
    await this.mailer.send({ to: [data.email], ...email });
  }

  private async processOrgInvite(data: OrgInviteJobData): Promise<void> {
    const email = renderOrgInviteEmail({
      orgName: data.orgName,
      inviterName: data.inviterName,
      role: data.role,
      token: data.token,
      appUrl: this.env.APP_URL,
    });
    await this.mailer.send({ to: [data.email], ...email });
  }

  private async processAssignment(data: AssignmentJobData): Promise<void> {
    const context = await this.repo.findAssignmentContext(data.orgId, data.projectId, data.userId);
    if (!context) {
      this.logger.error(`project.assigned: project ${data.projectId} or user ${data.userId} not found in org ${data.orgId}`);
      return;
    }
    if (!context.assigneeEmail) return; // пользователь удалён между enqueue и обработкой — не штатная ошибка

    const email = renderAssignmentEmail({
      projectId: data.projectId,
      projectTitle: context.projectTitle,
      appUrl: this.env.APP_URL,
    });
    await this.mailer.send({ to: [context.assigneeEmail], ...email });
  }

  private async processPhaseChanged(data: PhaseChangedJobData): Promise<void> {
    const context = await this.repo.findPhaseChangedContext(data.orgId, data.projectId, data.fromPhaseId, data.toPhaseId);
    if (!context) {
      this.logger.error(`project.phase_changed: project ${data.projectId} not found in org ${data.orgId}`);
      return;
    }

    // Owner+assignees минус сам actor (§ решение): не пинговать пользователя о его же действии.
    const recipients = new Set(
      [
        context.ownerId !== data.actorId ? context.ownerEmail : null,
        ...context.assignees.filter((a) => a.userId !== data.actorId).map((a) => a.email),
      ].filter((email): email is string => Boolean(email)),
    );
    if (recipients.size === 0) return;

    const email = renderPhaseChangedEmail({
      projectId: data.projectId,
      projectTitle: context.projectTitle,
      fromPhaseName: context.fromPhaseName,
      toPhaseName: context.toPhaseName,
      toPhaseType: context.toPhaseType,
      appUrl: this.env.APP_URL,
    });
    await this.mailer.send({ to: [...recipients], ...email });
  }

  /** pages-kb.md §2 — данные уже резолвлены на enqueue (не рефетчим), см. mention-job.ts. */
  private async processMention(data: MentionJobData): Promise<void> {
    const email = renderMentionEmail({
      mentionedUserName: data.mentionedUserName,
      actorName: data.actorName,
      pageId: data.pageId,
      pageTitle: data.pageTitle,
      projectId: data.projectId,
      commentBody: data.commentBody,
      appUrl: this.env.APP_URL,
    });
    await this.mailer.send({ to: [data.mentionedUserEmail], ...email });
  }
}
