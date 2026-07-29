import { TransportError } from "../../shared/api";

// §6.4: shared/api знает только HTTP; домен интерпретирует code внутри статуса здесь, в feature.
export type BoardError = "staleNeighbors" | "permissionDenied" | "notFound" | "unexpected";

export function toBoardError(error: unknown): BoardError {
  if (!(error instanceof TransportError)) return "unexpected";
  if (error.kind === "conflict" && error.code === "STALE_NEIGHBORS") return "staleNeighbors";
  if (error.kind === "forbidden") return "permissionDenied";
  if (error.kind === "notFound") return "notFound";
  return "unexpected";
}
