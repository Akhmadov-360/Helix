import { Inject, Injectable } from "@nestjs/common";
import { createTransport, type Transporter } from "nodemailer";
import type { Env } from "@helix/config";
import { ENV } from "../../../core/config/config.module";
import type { MailerService, MailMessage } from "./mailer.interface";

/**
 * Dev-путь (notifications.md §7): SMTP на MailHog (docker-compose.dev.yml) — без auth,
 * письма перехватываются локально, наружу не уходят. Прод — тот же путь, но с реальным
 * SMTP-провайдером (Resend/SendGrid/Mailgun и т.п.), которому auth обязателен — auth передаётся
 * только когда SMTP_USER/SMTP_PASS оба заданы, иначе nodemailer получил бы пустой объект
 * `{user: undefined, pass: undefined}` там, где сервер (MailHog) auth вообще не проверяет,
 * но реальный провайдер отклонил бы такое соединение на этапе AUTH.
 */
@Injectable()
export class SmtpMailerService implements MailerService {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(@Inject(ENV) env: Env) {
    const auth = env.SMTP_USER && env.SMTP_PASS ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined;
    this.transporter = createTransport({ host: env.SMTP_HOST, port: env.SMTP_PORT, auth });
    this.from = env.MAIL_FROM;
  }

  async send(msg: MailMessage): Promise<void> {
    await this.transporter.sendMail({ from: this.from, ...msg });
  }
}
