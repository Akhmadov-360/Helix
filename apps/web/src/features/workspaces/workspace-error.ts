import { TransportError } from "../../shared/api";

export type WorkspaceError = "permissionDenied" | "notFound" | "unexpected";

export function toWorkspaceError(error: unknown): WorkspaceError {
  if (!(error instanceof TransportError)) return "unexpected";
  if (error.kind === "forbidden") return "permissionDenied";
  if (error.kind === "notFound") return "notFound";
  return "unexpected";
}
