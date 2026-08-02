import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { contactListResponseSchema, contactResponseSchema, projectContactResponseSchema } from "@helix/api-schemas";
import { queryKeys, request } from "../../shared/api";

const projectContactListSchema = z.array(projectContactResponseSchema);

export function projectContactsQueryOptions(orgId: string, projectId: string) {
  return queryOptions({
    queryKey: queryKeys.projectContacts(orgId, projectId),
    queryFn: () =>
      request({ path: `/v1/projects/${projectId}/contacts`, schema: projectContactListSchema }),
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

export interface ContactsListQuery {
  q?: string;
  companyId?: string;
  [key: string]: string | undefined;
}

// Глобальная адресная книга (org-scoped, §архитектура): отдельная от per-project и от typeahead.
export function contactsListQueryOptions(orgId: string, query: ContactsListQuery = {}) {
  return queryOptions({
    queryKey: queryKeys.contactsList(orgId, query),
    queryFn: () => request({ path: "/v1/contacts", searchParams: query, schema: contactListResponseSchema }),
  });
}

export function contactQueryOptions(orgId: string, contactId: string) {
  return queryOptions({
    queryKey: queryKeys.contact(orgId, contactId),
    queryFn: () => request({ path: `/v1/contacts/${contactId}`, schema: contactResponseSchema }),
  });
}
