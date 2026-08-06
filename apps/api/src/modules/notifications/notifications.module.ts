import { Module } from "@nestjs/common";
import { EmailWorker } from "./email.worker";
import { MailerModule } from "./mailer/mailer.module";
import { NotificationsRepository } from "./notifications.repository";
import { NotificationsService } from "./notifications.service";

@Module({
  imports: [MailerModule],
  providers: [NotificationsService, NotificationsRepository, EmailWorker],
  // NotificationsService нужен PasswordResetService (auth/password-reset) для password.reset —
  // тот же приём, что AuthModule экспортирует AuthService для RegistrationService.
  exports: [NotificationsService],
})
export class NotificationsModule {}
