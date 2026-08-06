import { Inject, Injectable } from "@nestjs/common";
import { SendEmailCommand, SESClient } from "@aws-sdk/client-ses";
import type { Env } from "@helix/config";
import { ENV } from "../../../core/config/config.module";
import type { MailerService, MailMessage } from "./mailer.interface";

/**
 * Prod-путь (notifications.md §7): AWS SES. Креды — default credential provider chain
 * (IAM role в реальном деплое) — намеренно НЕ читаем AWS_ACCESS_KEY_ID/SECRET из env,
 * не изобретаем свой секрет-канал поверх стандартной AWS-практики.
 */
@Injectable()
export class SesMailerService implements MailerService {
  private readonly client: SESClient;
  private readonly from: string;

  constructor(@Inject(ENV) env: Env) {
    this.client = new SESClient({ region: env.SES_REGION });
    this.from = env.MAIL_FROM;
  }

  async send(msg: MailMessage): Promise<void> {
    await this.client.send(
      new SendEmailCommand({
        Source: this.from,
        Destination: { ToAddresses: msg.to },
        Message: {
          Subject: { Data: msg.subject },
          Body: { Html: { Data: msg.html }, Text: { Data: msg.text } },
        },
      }),
    );
  }
}
