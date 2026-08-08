export interface AssignmentEmailData {
  projectId: string;
  projectTitle: string;
  appUrl: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

// Тот же приём инлайнового CSS и deep-link'а, что и lead-created-email.ts.
export function renderAssignmentEmail(data: AssignmentEmailData): RenderedEmail {
  const link = `${data.appUrl}/projects/${data.projectId}/tasks`;
  const subject = `You were assigned: ${data.projectTitle}`;

  const html = `
<div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto;">
  <p style="font-size: 12px; letter-spacing: 0.04em; text-transform: uppercase; color: #6b7280;">Helix</p>
  <h1 style="font-size: 20px; margin: 8px 0 16px; color: #111827;">You were assigned to a lead</h1>
  <p style="font-size: 14px; color: #374151; margin: 0 0 20px;">
    You've been added as a co-worker on <strong>${data.projectTitle}</strong>.
  </p>
  <a href="${link}" style="display: inline-block; padding: 10px 20px; background: #2f5fe0; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 14px;">
    Open lead
  </a>
</div>`.trim();

  const text = `You were assigned to: ${data.projectTitle}\n\nOpen it: ${link}`;

  return { subject, html, text };
}
