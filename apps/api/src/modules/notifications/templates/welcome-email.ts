import type { RenderedEmail } from "./lead-created-email";

export interface WelcomeEmailData {
  name: string;
  appUrl: string;
}

// Ровно то же оформление, что остальные шаблоны (org-invite-email.ts, lead-created-email.ts) —
// инлайновый CSS, без MJML/React-Email (notifications.md §5). Список возможностей — 6 пунктов,
// не полный feature-tour: письмо открывают на 5 секунд, не читают как документацию.
export function renderWelcomeEmail(data: WelcomeEmailData): RenderedEmail {
  const link = `${data.appUrl}/`;
  const subject = "Добро пожаловать в Helix";

  const features = [
    ["Лиды-проекты", "каждая сделка — воркспейс с канбан-фазами, а не просто строка в таблице"],
    ["Контакты и компании", "единая база с дедупликацией и связями между сделками"],
    ["Задачи", "приоритеты, сроки, назначения — прямо внутри сделки"],
    ["Страницы и база знаний", "заметки, документы и вложения без стороннего диска"],
    ["ИИ-чат по проекту", "спрашивайте о сделке своими словами — ответ со ссылками на источники"],
    ["Гибкие роли", "Owner/Admin/Manager/Member/Viewer — доступ под задачу, не всё-или-ничего"],
  ] as const;

  const featureListHtml = features
    .map(
      ([title, desc]) => `
    <li style="margin: 0 0 10px; padding: 0; list-style: none;">
      <strong style="color: #111827;">${title}</strong>
      <span style="color: #6b7280;"> — ${desc}</span>
    </li>`,
    )
    .join("");

  const html = `
<div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto;">
  <p style="font-size: 12px; letter-spacing: 0.04em; text-transform: uppercase; color: #6b7280;">Helix</p>
  <h1 style="font-size: 20px; margin: 8px 0 16px; color: #111827;">Добро пожаловать, ${data.name}!</h1>
  <p style="font-size: 14px; color: #374151; margin: 0 0 20px;">
    Ваша организация в Helix готова. Вот с чего можно начать:
  </p>
  <ul style="margin: 0 0 24px; padding: 0;">${featureListHtml}</ul>
  <a href="${link}" style="display: inline-block; padding: 10px 20px; background: #2f5fe0; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 14px;">
    Открыть Helix
  </a>
</div>`.trim();

  const text = [
    `Добро пожаловать, ${data.name}!`,
    "",
    "Ваша организация в Helix готова. Вот с чего можно начать:",
    "",
    ...features.map(([title, desc]) => `— ${title}: ${desc}`),
    "",
    `Открыть Helix: ${link}`,
  ].join("\n");

  return { subject, html, text };
}
