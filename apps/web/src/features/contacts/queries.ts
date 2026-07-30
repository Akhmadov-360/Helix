import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { contactListResponseSchema, projectAssigneeResponseSchema, projectContactResponseSchema } from "@helix/api-schemas";
import { queryKeys, request } from "../../shared/api";

const projectContactListSchema = z.array(projectContactResponseSchema);
const projectAssigneeListSchema = z.array(projectAssigneeResponseSchema);

export function projectContactsQueryOptions(orgId: string, projectId: string) {
  return queryOptions({
    queryKey: queryKeys.projectContacts(orgId, projectId),
    queryFn: () =>
      request({ path: `/v1/projects/${projectId}/contacts`, schema: projectContactListSchema }),
  });
}

export function projectAssigneesQueryOptions(orgId: string, projectId: string) {
  return queryOptions({
    queryKey: queryKeys.projectAssignees(orgId, projectId),
    queryFn: () =>
      request({ path: `/v1/projects/${projectId}/assignees`, schema: projectAssigneeListSchema }),
  });
}

// Typeahead (§13.1) — не через loader, `enabled` держит его выключенным на пустой строке.
export function contactSearchQueryOptions(orgId: string, q: string) {
  return queryOptions({
    queryKey: queryKeys.contactSearch(orgId, q),
    queryFn: () =>
      request({ path: "/v1/contacts", searchParams: { q, limit: 10 }, schema: contactListResponseSchema }),
    enabled: q.trim().length > 0,
  });
}
