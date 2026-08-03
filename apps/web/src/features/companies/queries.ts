import { queryOptions } from "@tanstack/react-query";
import { companyDetailResponseSchema, companyListResponseSchema, contactListResponseSchema } from "@helix/api-schemas";
import { queryKeys, request } from "../../shared/api";

export interface CompaniesListQuery {
  q?: string;
  [key: string]: string | undefined;
}

export function companiesListQueryOptions(orgId: string, query: CompaniesListQuery = {}) {
  return queryOptions({
    queryKey: queryKeys.companiesList(orgId, query),
    queryFn: () => request({ path: "/v1/companies", searchParams: query, schema: companyListResponseSchema }),
  });
}

// Детали (§архитектура п.3): includes contacts — companyDetailResponseSchema уже расширяет
// companyResponseSchema списком контактов, отдельного запроса на «контакты этой компании» не нужно.
export function companyQueryOptions(orgId: string, companyId: string) {
  return queryOptions({
    queryKey: queryKeys.company(orgId, companyId),
    queryFn: () => request({ path: `/v1/companies/${companyId}`, schema: companyDetailResponseSchema }),
  });
}

// Typeahead под "привязать существующий контакт" на карточке компании — свой запрос, а не
// contactSearchQueryOptions из features/contacts: features/* не импортируют друг друга напрямую
// (композиция на уровне routes/), эндпоинт общий (/v1/contacts), логика тривиальна для дубля.
//
// q может быть пустым (design review): попап открывается с браузингом первых контактов орги, не
// только по явному запросу — иначе непонятно, кого вообще можно привязать, пока не начал печатать.
export function companyContactSearchQueryOptions(orgId: string, q: string) {
  return queryOptions({
    queryKey: ["org", orgId, "companies", "contactSearch", { q }] as const,
    queryFn: () =>
      request({
        path: "/v1/contacts",
        searchParams: q.trim() ? { q, limit: 20 } : { limit: 20 },
        schema: contactListResponseSchema,
      }),
  });
}
