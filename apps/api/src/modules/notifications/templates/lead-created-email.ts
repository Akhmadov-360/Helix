export interface LeadCreatedEmailData {
  projectId: string;
  projectTitle: string;
  appUrl: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

// notifications.md §5: одна template-функция, инлайновый CSS (email-клиенты не грузят внешние
// стили), без MJML/React-Email — не золотить движком ради одного письма. Deep link — тот же путь,
// что уже открывает фронт на карточке лида (apps/web routes/_authenticated/projects/$projectId).
export function renderLeadCreatedEmail(data: LeadCreatedEmailData): RenderedEmail {
  const link = `${data.appUrl}/projects/${data.projectId}/contacts`;
  const subject = `New lead: ${data.projectTitle}`;

  const html = `
<div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto;">
  <p style="font-size: 12px; letter-spacing: 0.04em; text-transform: uppercase; color: #6b7280;">Helix</p>
  <h1 style="font-size: 20px; margin: 8px 0 16px; color: #111827;">New lead created</h1>
  <p style="font-size: 14px; color: #374151; margin: 0 0 20px;">
    <strong>${data.projectTitle}</strong> was just added to your board.
  </p>
  <a href="${link}" style="display: inline-block; padding: 10px 20px; background: #2f5fe0; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 14px;">
    Open lead
  </a>
</div>`.trim();

  const text = `New lead created: ${data.projectTitle}\n\nOpen it: ${link}`;

  return { subject, html, text };
}
