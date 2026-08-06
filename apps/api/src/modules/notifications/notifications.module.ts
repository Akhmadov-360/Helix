import { Module } from "@nestjs/common";
import { EmailWorker } from "./email.worker";
import { MailerModule } from "./mailer/mailer.module";
import { NotificationsRepository } from "./notifications.repository";
import { NotificationsService } from "./notifications.service";

@Module({
  imports: [MailerModule],
  providers: [NotificationsService, NotificationsRepository, EmailWorker],
  exports: [NotificationsService],
})
export class NotificationsModule {}
