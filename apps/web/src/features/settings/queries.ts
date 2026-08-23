import { queryOptions } from "@tanstack/react-query";
import {
  auditLogListResponseSchema,
  inviteListResponseSchema,
  orgMemberDetailedListResponseSchema,
  organizationSettingsResponseSchema,
} from "@helix/api-schemas";
import { queryKeys, request } from "../../shared/api";

export interface AuditLogQuery {
  cursor?: string;
  limit?: number;
  action?: string;
  [key: string]: string | number | undefined;
}

// D5 (decisions.md): org-security-аудит, O/A only (сервер отказывает остальным ролям 403 —
// страница вообще не рендерится для них, см. audit-log-page.tsx route beforeLoad/useCan).
export function auditLogQueryOptions(orgId: string, query: AuditLogQuery = {}) {
  return queryOptions({
    queryKey: queryKeys.auditLog(orgId, query),
    queryFn: () => request({ path: "/v1/organizations/audit-log", searchParams: query, schema: auditLogListResponseSchema }),
    staleTime: 30_000,
  });
}

// Расширенный ростер — только под Settings > Members: name/email/role + assignedLeadsCount +
// openTasksCount (workload-метрики для админа). UI-пикеры продолжают жить на orgMembersQueryOptions
// из shared/org/queries.ts (базовая schema без extra JOIN'ов).
export function orgMembersDetailedQueryOptions(orgId: string) {
  return queryOptions({
    queryKey: queryKeys.orgMembersDetailed(orgId),
    queryFn: () =>
      request({
        path: "/v1/organizations/members",
        searchParams: { stats: "true" },
        schema: orgMemberDetailedListResponseSchema,
      }),
    staleTime: 60_000,
  });
}

// Только pending-инвайты (§6 invites.md) — actionable-список под MembersPage, не история.
export function orgInvitesQueryOptions(orgId: string) {
  return queryOptions({
    queryKey: queryKeys.orgInvites(orgId),
    queryFn: () => request({ path: "/v1/organizations/invites", schema: inviteListResponseSchema }),
  });
}

// FR-ORG-3: читают все роли (см. app-ability.ts) — та же видимость, что ростер участников.
export function orgSettingsQueryOptions(orgId: string) {
  return queryOptions({
    queryKey: queryKeys.orgSettings(orgId),
    queryFn: () => request({ path: "/v1/organizations/settings", schema: organizationSettingsResponseSchema }),
  });
}
