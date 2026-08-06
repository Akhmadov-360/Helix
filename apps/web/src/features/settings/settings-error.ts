import { TransportError } from "../../shared/api";

export type MemberError = "permissionDenied" | "notFound" | "lastOwner" | "soleOrganization" | "unexpected";

export function toMemberError(error: unknown): MemberError {
  if (!(error instanceof TransportError)) return "unexpected";
  if (error.kind === "forbidden") return "permissionDenied";
  if (error.kind === "notFound") return "notFound";
  // 409 — два разных инварианта (organizations.service.ts), различаем по machine-readable code,
  // не по message (тот для людей и может меняться/переводиться на бэке).
  if (error.kind === "conflict" && error.code === "LAST_OWNER") return "lastOwner";
  if (error.kind === "conflict" && error.code === "SOLE_ORGANIZATION_MEMBERSHIP") return "soleOrganization";
  return "unexpected";
}
