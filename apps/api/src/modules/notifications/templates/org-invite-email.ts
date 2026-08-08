import type { Role } from "@helix/db";
import type { RenderedEmail } from "./lead-created-email";

export interface OrgInviteEmailData {
  orgName: string;
  inviterName: string;
  role: Role;
  token: string;
  appUrl: string;
}

// Тот же приём, что renderPasswordResetEmail: query-param, не path — deep link ведёт на форму
// accept, которая сама решает REGISTER/ACCEPT (invites.md §3) по acceptMode из GET /invites/:token.
export function renderOrgInviteEmail(data: OrgInviteEmailData): RenderedEmail {
  const link = `${data.appUrl}/invite/accept?token=${encodeURIComponent(data.token)}`;
  const subject = `${data.inviterName} invited you to join ${data.orgName} on Helix`;

  const html = `
<div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto;">
  <p style="font-size: 12px; letter-spacing: 0.04em; text-transform: uppercase; color: #6b7280;">Helix</p>
  <h1 style="font-size: 20px; margin: 8px 0 16px; color: #111827;">You're invited</h1>
  <p style="font-size: 14px; color: #374151; margin: 0 0 20px;">
    <strong>${data.inviterName}</strong> invited you to join <strong>${data.orgName}</strong> as
    ${data.role}. This link expires in 7 days.
  </p>
  <a href="${link}" style="display: inline-block; padding: 10px 20px; background: #2f5fe0; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 14px;">
    Accept invite
  </a>
</div>`.trim();

  const text = `${data.inviterName} invited you to join ${data.orgName} on Helix as ${data.role}.\n\nAccept: ${link}\n\nThis link expires in 7 days.`;

  return { subject, html, text };
}
