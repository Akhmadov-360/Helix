import { TransportError } from "../../shared/api";

// §6.4: shared/api знает только HTTP; домен интерпретирует code внутри статуса здесь, в feature.
export type BoardError =
  | "staleNeighbors"
  | "missingRequiredFields"
  | "companyRequired"
  | "permissionDenied"
  | "notFound"
  | "unexpected";

export function toBoardError(error: unknown): BoardError {
  if (!(error instanceof TransportError)) return "unexpected";
  if (error.kind === "conflict" && error.code === "STALE_NEIGHBORS") return "staleNeighbors";
  if (error.kind === "validation" && error.code === "MISSING_REQUIRED_FIELDS") return "missingRequiredFields";
  if (error.kind === "validation" && error.code === "COMPANY_REQUIRED") return "companyRequired";
  if (error.kind === "forbidden") return "permissionDenied";
  if (error.kind === "notFound") return "notFound";
  return "unexpected";
}

// custom-fields.md §7: details.keys — ключи required-полей без значения. details — сеть,
// границу доверия парсим (§6.2), не доверяем вслепую.
export function missingFieldKeysFrom(error: unknown): string[] {
  if (!(error instanceof TransportError)) return [];
  const details = error.details as { keys?: unknown } | undefined;
  return Array.isArray(details?.keys) ? details.keys.filter((k): k is string => typeof k === "string") : [];
}
