import { Inject, Injectable } from "@nestjs/common";
import { createTransport, type Transporter } from "nodemailer";
import type { Env } from "@helix/config";
import { ENV } from "../../../core/config/config.module";
import type { MailerService, MailMessage } from "./mailer.interface";

/**
 * Dev-путь (notifications.md §7): SMTP без auth, указывает на MailHog
 * (docker-compose.dev.yml) — письма перехватываются локально, наружу не уходят.
 */
@Injectable()
export class SmtpMailerService implements MailerService {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(@Inject(ENV) env: Env) {
    this.transporter = createTransport({ host: env.SMTP_HOST, port: env.SMTP_PORT });
    this.from = env.MAIL_FROM;
  }

  async send(msg: MailMessage): Promise<void> {
    await this.transporter.sendMail({ from: this.from, ...msg });
  }
}
