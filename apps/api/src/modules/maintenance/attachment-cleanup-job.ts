/**
 * files.md §6 — НЕ repeatable: одноразовая джоба на конкретное событие (удаление Project),
 * данные = storage keys, прочитанные ДО каскадного удаления строк Attachment (иначе их негде
 * взять — БД уже не помнит удалённые строки). Тот же принцип, что письма — enqueue после коммита.
 */
export const ATTACHMENT_CLEANUP_JOB = "attachment.cleanup";

export interface AttachmentCleanupJobData {
  storageKeys: string[];
}
