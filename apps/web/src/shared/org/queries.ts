import { queryOptions } from "@tanstack/react-query";
import { orgMemberListResponseSchema } from "@helix/api-schemas";
import { queryKeys, request } from "../api";

// Живёт в shared/, не в features/contacts: используется contacts (assignees) И tasks (assignee
// picker) — пересечение фич идёт в shared, не через прямой импорт feature→feature (скелет §2).
export function orgMembersQueryOptions(orgId: string) {
  return queryOptions({
    queryKey: queryKeys.orgMembers(orgId),
    queryFn: () => request({ path: "/v1/organizations/members", schema: orgMemberListResponseSchema }),
  });
}
