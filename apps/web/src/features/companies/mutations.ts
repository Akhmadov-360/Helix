import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import type { CompanyListResponse, CreateCompanyInput, UpdateCompanyInput } from "@helix/api-schemas";
import { companyResponseSchema, createCompanyResponseSchema } from "@helix/api-schemas";
import { queryKeys, request } from "../../shared/api";
import { useT, type MessageKey } from "../../shared/i18n";
import { useToast } from "../../shared/toast/use-toast";
import { companiesListQueryOptions, companyQueryOptions } from "./queries";
import { toCompanyError } from "./company-error";

function companyErrorKey(kind: ReturnType<typeof toCompanyError>): MessageKey {
  switch (kind) {
    case "permissionDenied":
      return "companies.error.permissionDenied";
    case "notFound":
      return "companies.error.notFound";
    default:
      return "companies.error.unexpected";
  }
}

// Список — единственный query-key с параметрами (companiesList(orgId, query), см. query-keys.ts),
// поэтому create/update/delete патчат его по общему ["org", orgId, "companies", "list"] префиксу
// через invalidateQueries, а не setQueryData: конкретный `query` (q-фильтр), под которым сейчас
// открыт список, вызывающему компоненту неизвестен.
function invalidateCompaniesList(queryClient: ReturnType<typeof useQueryClient>, orgId: string) {
  void queryClient.invalidateQueries({ queryKey: ["org", orgId, "companies", "list"] });
}

export function useCreateCompany(orgId: string) {
  const queryClient = useQueryClient();
  const t = useT();
  const toast = useToast();

  return useMutation({
    mutationFn: (input: CreateCompanyInput) =>
      request({ method: "POST", path: "/v1/companies", body: input, schema: createCompanyResponseSchema }),
    onError: (error) => {
      const kind = toCompanyError(error);
      if (kind === "permissionDenied") void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      toast.error(t(companyErrorKey(kind)));
    },
    onSuccess: ({ company }) => {
      invalidateCompaniesList(queryClient, orgId);
      toast.show(t("companies.create.success", { name: company.name }));
    },
  });
}

export function useUpdateCompany(orgId: string) {
  const queryClient = useQueryClient();
  const t = useT();
  const toast = useToast();

  return useMutation({
    mutationFn: (vars: { companyId: string; input: UpdateCompanyInput }) =>
      request({
        method: "PATCH",
        path: `/v1/companies/${vars.companyId}`,
        body: vars.input,
        schema: companyResponseSchema,
      }),
    onError: (error) => {
      const kind = toCompanyError(error);
      if (kind === "permissionDenied") void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      toast.error(t(companyErrorKey(kind)));
    },
    onSuccess: (company) => {
      // Деталь несёт свой ключ (companyQueryOptions) — companyDetailResponseSchema расширяет
      // company-поля списком contacts, который PATCH не возвращает, поэтому мёржим точечно, не
      // заменяем весь кэш ответом мутации.
      queryClient.setQueryData(
        companyQueryOptions(orgId, company.id).queryKey,
        (current) => current && { ...current, ...company },
      );
      invalidateCompaniesList(queryClient, orgId);
      toast.show(t("companies.edit.success"));
    },
  });
}

export function useDeleteCompany(orgId: string) {
  const queryClient = useQueryClient();
  const t = useT();
  const toast = useToast();

  return useMutation({
    mutationFn: (vars: { companyId: string }) =>
      request({ method: "DELETE", path: `/v1/companies/${vars.companyId}`, schema: z.null() }),
    onError: (error) => {
      const kind = toCompanyError(error);
      if (kind === "permissionDenied") void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      toast.error(t(companyErrorKey(kind)));
    },
    onSuccess: (_data, vars) => {
      queryClient.setQueriesData<CompanyListResponse>(
        { queryKey: ["org", orgId, "companies", "list"] },
        (current) => current && { ...current, companies: current.companies.filter((c) => c.id !== vars.companyId) },
      );
      void queryClient.invalidateQueries({ queryKey: companiesListQueryOptions(orgId).queryKey });
      toast.show(t("companies.delete.success"));
    },
  });
}
