// notifications.md §7: тонкий контракт независимо от провайдера — EmailWorker (§9 шаг 5)
// зависит от него, не от конкретной реализации.
export interface MailMessage {
  to: string[];
  subject: string;
  html: string;
  text: string;
}

export interface MailerService {
  send(msg: MailMessage): Promise<void>;
}

/** DI-токен: `MailerService` — интерфейс, не класс, инжектить можно только по токену (как ENV). */
export const MAILER = Symbol("MAILER");
