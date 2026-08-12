import { TransportError } from "../../shared/api";

export type KbError = "permissionDenied" | "notFound" | "unexpected";

export function toKbError(error: unknown): KbError {
  if (!(error instanceof TransportError)) return "unexpected";
  if (error.kind === "forbidden") return "permissionDenied";
  if (error.kind === "notFound") return "notFound";
  return "unexpected";
}
