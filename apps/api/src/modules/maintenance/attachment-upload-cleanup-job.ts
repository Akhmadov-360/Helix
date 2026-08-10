export const ATTACHMENT_UPLOAD_CLEANUP_JOB = "attachment-upload.cleanup";

// Третий час подряд после refresh-session.cleanup (03:00) / invite.cleanup (04:00) — не толкаться.
export const ATTACHMENT_UPLOAD_CLEANUP_REPEAT_OPTIONS = { pattern: "0 5 * * *" };

// files.md §6.1 — часы, не дни: presigned PUT живёт 5 минут (files.md §3), сутки — большой запас
// на "клиент начал заливать, но не закончил", без риска убить ещё не завершённую загрузку.
export const ATTACHMENT_UPLOAD_CLEANUP_RETENTION_HOURS = 24;
