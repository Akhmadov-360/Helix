import type { PhaseType } from "@helix/db";
import { localize, type LocalizedName } from "@helix/api-schemas";

export interface PhaseChangedEmailData {
  projectId: string;
  projectTitle: string;
  fromPhaseName: LocalizedName | null;
  toPhaseName: LocalizedName;
  toPhaseType: PhaseType;
  appUrl: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

// Нет per-user locale (User не хранит его — см. schema.prisma), поэтому письма всегда на английском
// (тот же выбор, что lead-created-email.ts) — через P1-санкционированную localize() (common.ts).
function firstLabel(name: LocalizedName | null): string {
  return name ? localize(name, "en") : "";
}

function copyForPhaseType(
  toPhaseType: PhaseType,
  projectTitle: string,
  fromPhaseLabel: string,
  toPhaseLabel: string,
): { subject: string; heading: string; message: string } {
  if (toPhaseType === "WON") {
    return {
      subject: `Won: ${projectTitle}`,
      heading: "Deal won",
      message: `${projectTitle} was marked as won.`,
    };
  }
  if (toPhaseType === "LOST") {
    return {
      subject: `Lost: ${projectTitle}`,
      heading: "Deal lost",
      message: `${projectTitle} was marked as lost.`,
    };
  }
  return {
    subject: `Phase changed: ${projectTitle}`,
    heading: "Phase changed",
    message: `${projectTitle} moved from ${fromPhaseLabel} to ${toPhaseLabel}.`,
  };
}

// Один шаблон с ветвлением по PhaseType, а не три параллельных пайплайна — WON/LOST/обычный переход
// делят deep-link и разметку, различается только заголовок/текст.
export function renderPhaseChangedEmail(data: PhaseChangedEmailData): RenderedEmail {
  const link = `${data.appUrl}/projects/${data.projectId}/activity`;
  const fromPhaseLabel = firstLabel(data.fromPhaseName);
  const toPhaseLabel = firstLabel(data.toPhaseName);
  const { subject, heading, message } = copyForPhaseType(
    data.toPhaseType,
    data.projectTitle,
    fromPhaseLabel,
    toPhaseLabel,
  );

  const html = `
<div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto;">
  <p style="font-size: 12px; letter-spacing: 0.04em; text-transform: uppercase; color: #6b7280;">Helix</p>
  <h1 style="font-size: 20px; margin: 8px 0 16px; color: #111827;">${heading}</h1>
  <p style="font-size: 14px; color: #374151; margin: 0 0 20px;"><strong>${message}</strong></p>
  <a href="${link}" style="display: inline-block; padding: 10px 20px; background: #2f5fe0; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 14px;">
    Open lead
  </a>
</div>`.trim();

  const text = `${heading}: ${message}\n\nOpen it: ${link}`;

  return { subject, html, text };
}
