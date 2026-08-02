import type { PhaseType } from "@helix/api-schemas";
import type { BadgeProps } from "@helix/ui";

export function formatAmount(amount: { value: number; currency: string }, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: amount.currency }).format(amount.value);
}

// WON/LOST зеркалят Project.status (statusForPhaseType в projects.service.ts) — тот же вариант
// бейджа, что на детали лида (project-detail-shell.tsx), не заводим отдельную палитру под тот же смысл.
export function phaseTypeBadgeVariant(type: PhaseType): BadgeProps["variant"] {
  if (type === "WON") return "success";
  if (type === "LOST") return "destructive";
  return "default";
}
