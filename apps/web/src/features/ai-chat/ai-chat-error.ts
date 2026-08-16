import { TransportError } from "../../shared/api";

// §6.4: shared/api знает только HTTP; домен интерпретирует code внутри статуса здесь, в feature
// (тот же приём, что page-error.ts). code — из ai-chat.md §12/apps/api/core/errors/domain-error.ts:
// TransportErrorKind не различает 422-варианты (AI_PROVIDER_NOT_CONFIGURED/_NOT_IMPLEMENTED) и
// 409-вариант TOOL_CALL_NOT_PENDING — оба матчатся по code, не по одному только статусу.
export type AiChatError =
  | "permissionDenied"
  | "notFound"
  | "providerNotConfigured"
  | "providerNotImplemented"
  | "notPending"
  | "unexpected";

export function toAiChatError(error: unknown): AiChatError {
  if (!(error instanceof TransportError)) return "unexpected";
  if (error.code === "AI_PROVIDER_NOT_CONFIGURED") return "providerNotConfigured";
  if (error.code === "AI_PROVIDER_NOT_IMPLEMENTED") return "providerNotImplemented";
  if (error.code === "TOOL_CALL_NOT_PENDING") return "notPending";
  if (error.kind === "forbidden") return "permissionDenied";
  if (error.kind === "notFound") return "notFound";
  return "unexpected";
}
