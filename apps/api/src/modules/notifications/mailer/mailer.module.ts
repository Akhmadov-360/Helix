import { Module } from "@nestjs/common";
import type { Env } from "@helix/config";
import { ENV } from "../../../core/config/config.module";
import { MAILER, type MailerService } from "./mailer.interface";
import { ResendMailerService } from "./resend-mailer.service";
import { SesMailerService } from "./ses-mailer.service";
import { SmtpMailerService } from "./smtp-mailer.service";

/**
 * MAIL_PROVIDER выбирает реализацию (notifications.md §7) — явно, не по NODE_ENV
 * (эксплицитность дешевле неявной магии на дебаге «почему письмо ушло не туда»).
 * Обе конкретные реализации регистрируются как обычные провайдеры (конструктор не делает
 * сетевых вызовов — создать неиспользуемый клиент SES/SMTP-транспорт бесплатно), фабрика
 * просто выбирает, какую отдать под токеном `MAILER`.
 */
@Module({
  providers: [
    SmtpMailerService,
    SesMailerService,
    ResendMailerService,
    {
      provide: MAILER,
      inject: [ENV, SmtpMailerService, SesMailerService, ResendMailerService],
      useFactory: (env: Env, smtp: SmtpMailerService, ses: SesMailerService, resend: ResendMailerService): MailerService => {
        if (env.MAIL_PROVIDER === "ses") return ses;
        if (env.MAIL_PROVIDER === "resend") return resend;
        return smtp;
      },
    },
  ],
  exports: [MAILER],
})
export class MailerModule {}
