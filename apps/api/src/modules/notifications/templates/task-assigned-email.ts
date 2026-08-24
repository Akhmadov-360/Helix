export interface TaskAssignedEmailData {
  taskTitle: string;
  projectId: string;
  projectTitle: string;
  dueAt: Date | null;
  actorName: string | null;
  appUrl: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

// Тот же приём инлайнового CSS и deep-link'а, что assignment-email.ts / mention-email.ts.
// Deep-link ведёт на Tasks-таб сделки — прямой ссылки на конкретный таск у нас нет (URL-схема
// projects/{id}/tasks не параметризуется id таска). Юзер увидит свой таск в списке сразу.
export function renderTaskAssignedEmail(data: TaskAssignedEmailData): RenderedEmail {
  const link = `${data.appUrl}/projects/${data.projectId}/tasks`;
  const subject = `New task: ${data.taskTitle}`;
  const dueLine = data.dueAt
    ? `<p style="font-size: 13px; color: #6b7280; margin: 0 0 20px;">Due ${data.dueAt.toISOString().slice(0, 10)}</p>`
    : "";
  const actorLine = data.actorName
    ? `<p style="font-size: 14px; color: #374151; margin: 0 0 8px;"><strong>${data.actorName}</strong> assigned you a task on <strong>${data.projectTitle}</strong>:</p>`
    : `<p style="font-size: 14px; color: #374151; margin: 0 0 8px;">You were assigned a task on <strong>${data.projectTitle}</strong>:</p>`;

  const html = `
<div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto;">
  <p style="font-size: 12px; letter-spacing: 0.04em; text-transform: uppercase; color: #6b7280;">Helix</p>
  <h1 style="font-size: 20px; margin: 8px 0 16px; color: #111827;">New task assigned</h1>
  ${actorLine}
  <p style="font-size: 15px; color: #111827; margin: 0 0 12px; font-weight: 500;">${data.taskTitle}</p>
  ${dueLine}
  <a href="${link}" style="display: inline-block; padding: 10px 20px; background: #2f5fe0; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 14px;">
    Open task
  </a>
</div>`.trim();

  const text = `${data.actorName ? `${data.actorName} assigned you` : "You were assigned"} a task on ${data.projectTitle}: ${data.taskTitle}${data.dueAt ? ` (due ${data.dueAt.toISOString().slice(0, 10)})` : ""}\n\nOpen it: ${link}`;

  return { subject, html, text };
}
