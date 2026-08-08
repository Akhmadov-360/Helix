export const INVITE_CLEANUP_JOB = "invite.cleanup";

// Сдвинут на час от refresh-session.cleanup (03:00) — не толкаться в одно и то же время.
export const INVITE_CLEANUP_REPEAT_OPTIONS = { pattern: "0 4 * * *" };

// invites.md §11: отдельное число от REFRESH_SESSION_RETENTION_DAYS (30) — другая причина
// (support/отладка «правда ли отправили инвайт», не security-инцидент-анализ на REUSE).
export const INVITE_RETENTION_DAYS = 90;
