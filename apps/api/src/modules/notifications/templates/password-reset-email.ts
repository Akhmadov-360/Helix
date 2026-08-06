import type { RenderedEmail } from "./lead-created-email";

export interface PasswordResetEmailData {
  name: string;
  token: string;
  appUrl: string;
}

// Тот же приём, что renderLeadCreatedEmail: одна template-функция, инлайновый CSS,
// без MJML/React-Email ради единственного письма. Токен уходит СЫРЫМ в query — это
// единственный момент его существования вне БД (там только хеш, см. password-reset-token.ts).
export function renderPasswordResetEmail(data: PasswordResetEmailData): RenderedEmail {
  const link = `${data.appUrl}/reset-password?token=${encodeURIComponent(data.token)}`;
  const subject = "Reset your Helix password";

  const html = `
<div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto;">
  <p style="font-size: 12px; letter-spacing: 0.04em; text-transform: uppercase; color: #6b7280;">Helix</p>
  <h1 style="font-size: 20px; margin: 8px 0 16px; color: #111827;">Reset your password</h1>
  <p style="font-size: 14px; color: #374151; margin: 0 0 20px;">
    Hi ${data.name}, click the button below to choose a new password. This link expires in 1 hour.
  </p>
  <a href="${link}" style="display: inline-block; padding: 10px 20px; background: #2f5fe0; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 14px;">
    Reset password
  </a>
  <p style="font-size: 12px; color: #9ca3af; margin-top: 20px;">
    If you didn't request this, you can safely ignore this email.
  </p>
</div>`.trim();

  const text = `Reset your Helix password: ${link}\n\nThis link expires in 1 hour. If you didn't request this, ignore this email.`;

  return { subject, html, text };
}
