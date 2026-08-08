export const REFRESH_SESSION_CLEANUP_JOB = "refresh-session.cleanup";

// jobId фиксирован — тот же repeatable job при каждом рестарте приложения, BullMQ не плодит дубликат
// по (name, repeat-options, jobId). Cron: раз в сутки в 03:00 — вне пиковых часов.
export const REFRESH_SESSION_CLEANUP_REPEAT_OPTIONS = { pattern: "0 3 * * *" };

// §retention: удаляем только строки, мёртвые дольше этого срока — окно на инцидент-анализ
// (revokedReason=REUSE) после того, как сессия уже отозвана/использована/истекла.
export const REFRESH_SESSION_RETENTION_DAYS = 30;
