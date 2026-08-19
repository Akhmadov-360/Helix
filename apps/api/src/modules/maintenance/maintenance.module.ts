import { Logger, Module, type OnModuleInit } from "@nestjs/common";
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
  private readonly logger = new Logger(MaintenanceModule.name);

  constructor(@InjectQueue(MAINTENANCE_QUEUE) private readonly queue: Queue) {}

  // FIRE-AND-FORGET: раньше был `await` на трёх queue.add() последовательно — если Redis отвечает
  // медленно (кросс-регион Upstash Singapore ↔ Railway Amsterdam ~300мс/запрос) или подключение
  // висит на TLS-handshake, bootstrap блокировался на onModuleInit, app.listen() никогда не
  // вызывался, Railway edge отвечал 502 на все запросы. Регистрация cron'ов идемпотентна —
  // если этот boot не смог, следующий (или ручной вызов) её выполнит; главное — не блокировать HTTP.
  onModuleInit(): void {
    void this.registerRepeatables();
  }

  private async registerRepeatables(): Promise<void> {
    try {
      await Promise.all([
        this.queue.add(
          REFRESH_SESSION_CLEANUP_JOB,
          {},
          { repeat: REFRESH_SESSION_CLEANUP_REPEAT_OPTIONS, jobId: REFRESH_SESSION_CLEANUP_JOB },
        ),
        this.queue.add(
          INVITE_CLEANUP_JOB,
          {},
          { repeat: INVITE_CLEANUP_REPEAT_OPTIONS, jobId: INVITE_CLEANUP_JOB },
        ),
        this.queue.add(
          ATTACHMENT_UPLOAD_CLEANUP_JOB,
          {},
          { repeat: ATTACHMENT_UPLOAD_CLEANUP_REPEAT_OPTIONS, jobId: ATTACHMENT_UPLOAD_CLEANUP_JOB },
        ),
      ]);
      this.logger.log("Repeatable cleanup jobs registered");
    } catch (error) {
      // Логируем, не бросаем — эта задача не должна валить сервис. Реальный симптом (нет чистки
      // за сутки) виден в логах воркера, а не тут; здесь важно оставить хлебные крошки для debug.
      this.logger.error(`Failed to register repeatable jobs: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
