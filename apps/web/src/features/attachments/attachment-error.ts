import { TransportError } from "../../shared/api";

// §6.4 (тот же приём, что task-error.ts): shared/api знает только HTTP, домен интерпретирует
// code внутри статуса здесь. ATTACHMENT_TOO_LARGE/ATTACHMENT_UPLOAD_NOT_CONFIRMED — свои коды
// (files.md §3/§4), остальное — общие transport-kind'ы.
export type AttachmentError = "permissionDenied" | "notFound" | "tooLarge" | "uploadNotConfirmed" | "unexpected";

export function toAttachmentError(error: unknown): AttachmentError {
  if (!(error instanceof TransportError)) return "unexpected";
  if (error.kind === "forbidden") return "permissionDenied";
  if (error.kind === "notFound") return "notFound";
  if (error.code === "ATTACHMENT_TOO_LARGE") return "tooLarge";
  if (error.code === "ATTACHMENT_UPLOAD_NOT_CONFIRMED") return "uploadNotConfirmed";
  return "unexpected";
}
