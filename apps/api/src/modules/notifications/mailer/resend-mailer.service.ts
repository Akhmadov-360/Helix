import { Inject, Injectable } from "@nestjs/common";
import type { Env } from "@helix/config";
import { ENV } from "../../../core/config/config.module";
import type { MailerService, MailMessage } from "./mailer.interface";

const RESEND_API_URL = "https://api.resend.com/emails";

/**
 * Prod-путь для Railway (и большинства PaaS): обнаружено вживую, что исходящий SMTP (порты
 * 25/465/587) блокируется на уровне сети — SmtpMailerService падал по "Connection timeout"
 * ещё до того, как Resend вообще видел запрос (0 использований токена на их стороне). HTTP API
 * на 443 не блокируется — тот же Resend-аккаунт, тот же MAIL_FROM, просто другой транспорт.
 */
@Injectable()
export class ResendMailerService implements MailerService {
  private readonly apiKey: string;
  private readonly from: string;

  constructor(@Inject(ENV) env: Env) {
    this.apiKey = env.RESEND_API_KEY ?? "";
    this.from = env.MAIL_FROM;
  }

  async send(msg: MailMessage): Promise<void> {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: this.from, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text }),
    });
    if (!res.ok) {
      // Тело ответа Resend на ошибку — читаемый JSON {message, name} — полезно в логе EmailWorker
      // при неудаче джобы (failedReason в BullMQ), не просто "400 Bad Request".
      const body = await res.text().catch(() => "");
      throw new Error(`Resend API error ${res.status}: ${body}`);
    }
  }
}
