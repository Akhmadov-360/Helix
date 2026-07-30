import { TransportError } from "../../shared/api";

// §6.4: shared/api знает только HTTP; домен интерпретирует code внутри статуса здесь, в feature.
export type LinkContactError =
  | { kind: "merged"; mergedIntoId: string }
  | { kind: "alreadyLinked" }
  | { kind: "permissionDenied" }
  | { kind: "notFound" }
  | { kind: "unexpected" };

export function toLinkContactError(error: unknown): LinkContactError {
  if (!(error instanceof TransportError)) return { kind: "unexpected" };
  if (error.kind === "conflict" && error.code === "CONTACT_MERGED_LINK") {
    const details = error.details as { mergedIntoId?: unknown } | undefined;
    const mergedIntoId = typeof details?.mergedIntoId === "string" ? details.mergedIntoId : "";
    return { kind: "merged", mergedIntoId };
  }
  if (error.kind === "conflict" && error.code === "CONTACT_ALREADY_LINKED") return { kind: "alreadyLinked" };
  if (error.kind === "forbidden") return { kind: "permissionDenied" };
  if (error.kind === "notFound") return { kind: "notFound" };
  return { kind: "unexpected" };
}

export type AssigneeError = "alreadyAssigned" | "permissionDenied" | "notFound" | "unexpected";

export function toAssigneeError(error: unknown): AssigneeError {
  if (!(error instanceof TransportError)) return "unexpected";
  if (error.kind === "conflict" && error.code === "ASSIGNEE_ALREADY_EXISTS") return "alreadyAssigned";
  if (error.kind === "forbidden") return "permissionDenied";
  if (error.kind === "notFound") return "notFound";
  return "unexpected";
}

// Общая доменная ошибка на прочие мутации (unlink/update roles/create contact) — тот же паттерн,
// что board-error.ts/phase-error.ts.
export type ContactError = "permissionDenied" | "notFound" | "unexpected";

export function toContactError(error: unknown): ContactError {
  if (!(error instanceof TransportError)) return "unexpected";
  if (error.kind === "forbidden") return "permissionDenied";
  if (error.kind === "notFound") return "notFound";
  return "unexpected";
}
