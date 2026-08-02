import { queryOptions } from "@tanstack/react-query";
import { companyDetailResponseSchema, companyListResponseSchema } from "@helix/api-schemas";
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
