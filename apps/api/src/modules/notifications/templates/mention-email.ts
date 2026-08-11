import type { RenderedEmail } from "./assignment-email";

export interface MentionEmailData {
  mentionedUserName: string;
  actorName: string;
  pageId: string;
  pageTitle: string;
  projectId: string;
  commentBody: string;
  appUrl: string;
}

// code-review: actorName/pageTitle/commentBody — пользовательский ввод (Page.title, User.name,
// PageComment.body — до 200 символов свободного текста в превью), интерполировались в HTML без
// экранирования. `<a href="...">` в теле комментария рендерился бы кликабельной ссылкой прямо в
// "Helix"-брендированном письме — готовый фишинг-вектор. Экранируем перед вставкой в html (НЕ в
// subject/text — там это просто текст, не разметка).
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Тот же приём инлайнового CSS и deep-link'а, что assignment-email.ts.
export function renderMentionEmail(data: MentionEmailData): RenderedEmail {
  const link = `${data.appUrl}/projects/${data.projectId}/pages/${data.pageId}`;
  const subject = `${data.actorName} mentioned you on "${data.pageTitle}"`;

  const actorNameHtml = escapeHtml(data.actorName);
  const pageTitleHtml = escapeHtml(data.pageTitle);
  const commentBodyHtml = escapeHtml(data.commentBody);

  const html = `
<div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto;">
  <p style="font-size: 12px; letter-spacing: 0.04em; text-transform: uppercase; color: #6b7280;">Helix</p>
  <h1 style="font-size: 20px; margin: 8px 0 16px; color: #111827;">You were mentioned in a comment</h1>
  <p style="font-size: 14px; color: #374151; margin: 0 0 12px;">
    <strong>${actorNameHtml}</strong> mentioned you on <strong>${pageTitleHtml}</strong>:
  </p>
  <p style="font-size: 14px; color: #374151; margin: 0 0 20px; padding: 12px; background: #f3f4f6; border-radius: 6px;">
    ${commentBodyHtml}
  </p>
  <a href="${link}" style="display: inline-block; padding: 10px 20px; background: #2f5fe0; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 14px;">
    Open page
  </a>
</div>`.trim();

  const text = `${data.actorName} mentioned you on "${data.pageTitle}":\n\n${data.commentBody}\n\nOpen it: ${link}`;

  return { subject, html, text };
}
