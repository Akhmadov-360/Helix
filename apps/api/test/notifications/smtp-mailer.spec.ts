import { beforeEach, describe, expect, it } from "vitest";
import type { Env } from "@helix/config";
import { SmtpMailerService } from "../../src/modules/notifications/mailer/smtp-mailer.service";

// Живой SMTP-путь (notifications.md §7): реально отправляет через MailHog
// (docker compose up -d mailhog, порт 1025) и проверяет доставку через его REST API —
// не мок транспорта, а тот же MailHog, что разработчик открывает на localhost:8025.
const MAILHOG_API = "http://localhost:8025/api/v2/messages";

async function clearMailhog(): Promise<void> {
  await fetch(MAILHOG_API, { method: "DELETE" });
}

describe("SmtpMailerService — доставка через MailHog", () => {
  const env = { SMTP_HOST: "localhost", SMTP_PORT: 1025, MAIL_FROM: "Helix <noreply@helix.dev>" } as Env;
  const mailer = new SmtpMailerService(env);

  beforeEach(async () => {
    await clearMailhog();
  });

  it("письмо доходит до MailHog с корректными to/subject/text", async () => {
    // ASCII-only контент: не про MIME encoded-word декодирование не-ASCII заголовков/тела —
    // это deliverability-тест транспорта, не тест шаблона письма (тот появится в §5-6).
    await mailer.send({
      to: ["owner@helix.dev"],
      subject: "New lead: Acme Corp",
      html: "<p>New lead created</p>",
      text: "New lead created",
    });

    const res = await fetch(MAILHOG_API);
    const body = (await res.json()) as { items: { To: { Mailbox: string; Domain: string }[]; Content: { Headers: Record<string, string[]>; Body: string } }[] };

    expect(body.items).toHaveLength(1);
    const [msg] = body.items;
    expect(`${msg!.To[0]!.Mailbox}@${msg!.To[0]!.Domain}`).toBe("owner@helix.dev");
    expect(msg!.Content.Headers["Subject"]?.[0]).toBe("New lead: Acme Corp");
    expect(msg!.Content.Body).toContain("New lead created");
  });
});
