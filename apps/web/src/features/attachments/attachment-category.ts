// Клиентский фильтр по формату (список уже отдаёт mimeType, отдельного запроса не нужно) —
// широкие категории, не точный MIME-allowlist (files.md §4: бэкенд намеренно без allowlist).
export type AttachmentCategory = "all" | "image" | "document" | "other";

const DOCUMENT_MIME_PREFIXES = ["text/", "application/pdf", "application/msword", "application/vnd."];

export function categorizeAttachment(mimeType: string): Exclude<AttachmentCategory, "all"> {
  if (mimeType.startsWith("image/")) return "image";
  if (DOCUMENT_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix))) return "document";
  return "other";
}
