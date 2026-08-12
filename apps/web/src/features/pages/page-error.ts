import { TransportError } from "../../shared/api";

// §6.4: shared/api знает только HTTP; домен интерпретирует code внутри статуса здесь, в feature.
export type PageError = "permissionDenied" | "notFound" | "unexpected";

export function toPageError(error: unknown): PageError {
  if (!(error instanceof TransportError)) return "unexpected";
  if (error.kind === "forbidden") return "permissionDenied";
  if (error.kind === "notFound") return "notFound";
  return "unexpected";
}
