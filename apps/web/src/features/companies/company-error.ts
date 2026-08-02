import { TransportError } from "../../shared/api";

// Тот же паттерн, что contact-error.ts/phase-error.ts (§6.4): shared/api знает только HTTP,
// домен интерпретирует kind/code здесь.
export type CompanyError = "permissionDenied" | "notFound" | "unexpected";

export function toCompanyError(error: unknown): CompanyError {
  if (!(error instanceof TransportError)) return "unexpected";
  if (error.kind === "forbidden") return "permissionDenied";
  if (error.kind === "notFound") return "notFound";
  return "unexpected";
}
