import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import type { Env } from "@helix/config";
import { ConfigModule, ENV } from "../../src/core/config/config.module";
import { MAILER } from "../../src/modules/notifications/mailer/mailer.interface";
import { MailerModule } from "../../src/modules/notifications/mailer/mailer.module";
import { ResendMailerService } from "../../src/modules/notifications/mailer/resend-mailer.service";
import { SesMailerService } from "../../src/modules/notifications/mailer/ses-mailer.service";
import { SmtpMailerService } from "../../src/modules/notifications/mailer/smtp-mailer.service";

// MAIL_PROVIDER выбирает реализацию явно (notifications.md §7) — не по NODE_ENV. Единственная
// ветка логики в этом срезе, которую стоит покрыть отдельно от живой отправки (smtp-mailer.spec.ts).
function buildEnv(overrides: Partial<Env>): Env {
  return {
    MAIL_FROM: "Helix <noreply@helix.dev>",
    SMTP_HOST: "localhost",
    SMTP_PORT: 1025,
    SES_REGION: "us-east-1",
    ...overrides,
  } as Env;
}

describe("MailerModule — выбор реализации по MAIL_PROVIDER", () => {
  it("smtp → MAILER резолвится в SmtpMailerService", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, MailerModule],
    })
      .overrideProvider(ENV)
      .useValue(buildEnv({ MAIL_PROVIDER: "smtp" }))
      .compile();

    expect(moduleRef.get(MAILER)).toBeInstanceOf(SmtpMailerService);
  });

  it("ses → MAILER резолвится в SesMailerService", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, MailerModule],
    })
      .overrideProvider(ENV)
      .useValue(buildEnv({ MAIL_PROVIDER: "ses" }))
      .compile();

    expect(moduleRef.get(MAILER)).toBeInstanceOf(SesMailerService);
  });

  it("resend → MAILER резолвится в ResendMailerService", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, MailerModule],
    })
      .overrideProvider(ENV)
      .useValue(buildEnv({ MAIL_PROVIDER: "resend", RESEND_API_KEY: "re_test" }))
      .compile();

    expect(moduleRef.get(MAILER)).toBeInstanceOf(ResendMailerService);
  });
});
