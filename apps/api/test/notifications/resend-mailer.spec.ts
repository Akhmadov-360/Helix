import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@helix/config";
import { ResendMailerService } from "../../src/modules/notifications/mailer/resend-mailer.service";

// HTTP API, не SMTP (см. resend-mailer.service.ts) — нет локального тестового сервера вроде
// MailHog для этого транспорта, мокаем fetch и проверяем форму запроса/обработку ошибок.
describe("ResendMailerService — доставка через HTTP API", () => {
  const env = { RESEND_API_KEY: "re_test_key", MAIL_FROM: "Helix <noreply@helix.dev>" } as Env;
  const mailer = new ResendMailerService(env);
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("шлёт POST на api.resend.com/emails с Bearer-токеном и телом письма", async () => {
    fetchMock.mockResolvedValue({ ok: true, text: async () => "" });

    await mailer.send({ to: ["owner@helix.dev"], subject: "New lead", html: "<p>Hi</p>", text: "Hi" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer re_test_key", "Content-Type": "application/json" }),
      }),
    );
    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(options.body)).toEqual({
      from: "Helix <noreply@helix.dev>",
      to: ["owner@helix.dev"],
      subject: "New lead",
      html: "<p>Hi</p>",
      text: "Hi",
    });
  });

  it("не-ok ответ бросает ошибку с телом ответа Resend", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 422, text: async () => '{"message":"invalid from"}' });

    await expect(mailer.send({ to: ["owner@helix.dev"], subject: "x", html: "x", text: "x" })).rejects.toThrow(
      /Resend API error 422/,
    );
  });
});
