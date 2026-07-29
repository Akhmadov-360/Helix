import { TransportError } from "../../shared/api";

// §6.4: shared/api знает только HTTP; домен интерпретирует code внутри статуса здесь, в feature.
export type PhaseError = "versionConflict" | "permissionDenied" | "notFound" | "unexpected";

export function toPhaseError(error: unknown): PhaseError {
  if (!(error instanceof TransportError)) return "unexpected";
  if (error.kind === "conflict" && error.code === "WORKSPACE_VERSION_CONFLICT") return "versionConflict";
  if (error.kind === "forbidden") return "permissionDenied";
  if (error.kind === "notFound") return "notFound";
  return "unexpected";
}
