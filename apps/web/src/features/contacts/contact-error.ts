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

// Общая доменная ошибка на прочие мутации (unlink/update roles/create contact) — тот же паттерн,
// что board-error.ts/phase-error.ts.
//
// "linkedToDeal" — 409 FK_VIOLATION на DELETE /contacts/:id: Contact→ProjectContact это
// onDelete: Restrict, не Cascade (decisions.md D2, contacts.repository.ts) — контакт, ещё
// привязанный участником к сделке, не удаляется молча. Без этого кейса ошибка падала в
// "unexpected" и юзер видел бесполезный "попробуйте ещё раз" вместо причины.
export type ContactError = "permissionDenied" | "notFound" | "linkedToDeal" | "unexpected";

export function toContactError(error: unknown): ContactError {
  if (!(error instanceof TransportError)) return "unexpected";
  if (error.kind === "forbidden") return "permissionDenied";
  if (error.kind === "notFound") return "notFound";
  if (error.kind === "conflict" && error.code === "FK_VIOLATION") return "linkedToDeal";
  return "unexpected";
}
