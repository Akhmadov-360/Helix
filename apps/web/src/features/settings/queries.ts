import { queryOptions } from "@tanstack/react-query";
import { auditLogListResponseSchema, inviteListResponseSchema } from "@helix/api-schemas";
import { queryKeys, request } from "../../shared/api";

// D5 (decisions.md): org-security-аудит, O/A only (сервер отказывает остальным ролям 403 —
// страница вообще не рендерится для них, см. audit-log-page.tsx route beforeLoad/useCan).
export function auditLogQueryOptions(orgId: string) {
  return queryOptions({
    queryKey: queryKeys.auditLog(orgId),
    queryFn: () => request({ path: "/v1/organizations/audit-log", schema: auditLogListResponseSchema }),
    staleTime: 30_000,
  });
}

// Только pending-инвайты (§6 invites.md) — actionable-список под MembersPage, не история.
export function orgInvitesQueryOptions(orgId: string) {
  return queryOptions({
    queryKey: queryKeys.orgInvites(orgId),
    queryFn: () => request({ path: "/v1/organizations/invites", schema: inviteListResponseSchema }),
  });
}
