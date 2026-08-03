import { TransportError } from "../../shared/api";

// Тот же паттерн, что contact-error.ts/phase-error.ts (§6.4): shared/api знает только HTTP,
// домен интерпретирует kind/code здесь.
//
// "linkedToDeal" — 409 FK_VIOLATION на DELETE /companies/:id: Project.companyId это
// ON DELETE RESTRICT (миграция init, не SET NULL как у Contact.companyId) — компанию, на
// которую ссылается хотя бы одна сделка, нельзя удалить молча. Без этого кейса ошибка падала
// в "unexpected" и юзер видел бесполезный "попробуйте ещё раз" вместо причины.
export type CompanyError = "permissionDenied" | "notFound" | "linkedToDeal" | "unexpected";

export function toCompanyError(error: unknown): CompanyError {
  if (!(error instanceof TransportError)) return "unexpected";
  if (error.kind === "forbidden") return "permissionDenied";
  if (error.kind === "notFound") return "notFound";
  if (error.kind === "conflict" && error.code === "FK_VIOLATION") return "linkedToDeal";
  return "unexpected";
}
