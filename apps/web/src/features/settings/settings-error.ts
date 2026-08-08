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

export type InviteError = "permissionDenied" | "notFound" | "roleTooHigh" | "alreadyMember" | "unexpected";

export function toInviteError(error: unknown): InviteError {
  if (!(error instanceof TransportError)) return "unexpected";
  if (error.kind === "forbidden") return "permissionDenied";
  if (error.kind === "notFound") return "notFound";
  if (error.kind === "validation" && error.code === "INVITE_ROLE_EXCEEDS_INVITER") return "roleTooHigh";
  if (error.kind === "conflict" && error.code === "ALREADY_ORG_MEMBER") return "alreadyMember";
  return "unexpected";
}

export type OrgSettingsError = "permissionDenied" | "validation" | "unexpected";

export function toOrgSettingsError(error: unknown): OrgSettingsError {
  if (!(error instanceof TransportError)) return "unexpected";
  if (error.kind === "forbidden") return "permissionDenied";
  if (error.kind === "validation") return "validation";
  return "unexpected";
}
