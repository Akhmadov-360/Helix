import { TransportError } from "../../shared/api";

export type BlueprintError = "permissionDenied" | "notFound" | "unexpected";

export function toBlueprintError(error: unknown): BlueprintError {
  if (!(error instanceof TransportError)) return "unexpected";
  if (error.kind === "forbidden") return "permissionDenied";
  if (error.kind === "notFound") return "notFound";
  return "unexpected";
}
