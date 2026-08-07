import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import type { CompanyDetailResponse, CompanyListResponse, CreateCompanyInput, UpdateCompanyInput } from "@helix/api-schemas";
import { companyResponseSchema, contactResponseSchema, createCompanyResponseSchema, projectResponseSchema } from "@helix/api-schemas";
import { queryKeys, request } from "../../shared/api";
import { useT, type MessageKey } from "../../shared/i18n";
import { toast } from "sonner";
import { companiesListQueryOptions, companyQueryOptions } from "./queries";
import { toCompanyError } from "./company-error";

function companyErrorKey(kind: ReturnType<typeof toCompanyError>): MessageKey {
  switch (kind) {
    case "permissionDenied":
      return "companies.error.permissionDenied";
    case "notFound":
      return "companies.error.notFound";
    case "linkedToDeal":
      return "companies.error.linkedToDeal";
    default:
      return "companies.error.unexpected";
  }
}

// Список — единственный query-key с параметрами (companiesList(orgId, query), см. query-keys.ts),
// поэтому create/update/delete патчат его по общему ["org", orgId, "companies", "list"] префиксу
// через invalidateQueries, а не setQueryData: конкретный `query` (q-фильтр), под которым сейчас
// открыт список, вызывающему компоненту неизвестен.
export function invalidateCompaniesList(queryClient: ReturnType<typeof useQueryClient>, orgId: string) {
  void queryClient.invalidateQueries({ queryKey: ["org", orgId, "companies", "list"] });
}

export function useCreateCompany(orgId: string) {
  const queryClient = useQueryClient();
  const t = useT();

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
      toast.success(t("companies.create.success", { name: company.name }));
    },
  });
}

export function useUpdateCompany(orgId: string) {
  const queryClient = useQueryClient();
  const t = useT();

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
      // company-поля списком contacts (полный Contact[], не ContactLink[] списочного company),
      // который PATCH не возвращает, поэтому мёржим точечно, сохраняя current.contacts, а не
      // затирая его несовместимым списочным полем той же мутации.
      queryClient.setQueryData(
        companyQueryOptions(orgId, company.id).queryKey,
        (current) => current && { ...current, ...company, contacts: current.contacts },
      );
      invalidateCompaniesList(queryClient, orgId);
      toast.success(t("companies.edit.success"));
    },
  });
}

export function useDeleteCompany(orgId: string) {
  const queryClient = useQueryClient();
  const t = useT();

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
      toast.success(t("companies.delete.success"));
    },
  });
}

// Отвязка компании от сделки — НЕ join-таблица, как ProjectContact у контактов (contacts/
// mutations.ts useUnlinkContact): у Project ровно одна company (companyId, nullish — §3),
// "отвязать" = PATCH companyId:null. Одной инстанции хватает на все чипы сразу (в отличие от
// useUnlinkContact, которому нужен свой per-project query-key) — кэш, который она трогает
// (companiesList), общий на всю страницу, а не per-project.
export function useUnlinkCompanyFromProject(orgId: string) {
  const queryClient = useQueryClient();
  const t = useT();

  return useMutation({
    mutationFn: (vars: { projectId: string }) =>
      request({
        method: "PATCH",
        path: `/v1/projects/${vars.projectId}`,
        body: { companyId: null },
        schema: projectResponseSchema,
      }),
    onError: () => {
      toast.error(t("companies.error.unexpected"));
    },
    onSuccess: () => {
      invalidateCompaniesList(queryClient, orgId);
    },
  });
}

// Привязать/отвязать СУЩЕСТВУЮЩИЙ контакт к этой компании со страницы компании (design review):
// PATCH /v1/contacts/:id { companyId } — то же поле, что редактирует ContactFormDialog в features/
// contacts, но своя мутация здесь (не импорт useUpdateContact оттуда — features/* не импортируют
// друг друга напрямую). link:false → companyId:null (тот же "отвязать", что уже был доступен
// через форму контакта, просто теперь ещё и прямо с карточки компании).
export function useSetContactCompany(orgId: string, companyId: string) {
  const queryClient = useQueryClient();
  const t = useT();
  const queryKey = companyQueryOptions(orgId, companyId).queryKey;

  return useMutation({
    mutationFn: (vars: { contactId: string; link: boolean }) =>
      request({
        method: "PATCH",
        path: `/v1/contacts/${vars.contactId}`,
        body: { companyId: vars.link ? companyId : null },
        schema: contactResponseSchema,
      }),
    onError: () => toast.error(t("companies.error.unexpected")),
    onSuccess: (contact, vars) => {
      queryClient.setQueryData<CompanyDetailResponse>(queryKey, (current) => {
        if (!current) return current;
        const contacts = vars.link
          ? [...current.contacts.filter((c) => c.id !== contact.id), contact]
          : current.contacts.filter((c) => c.id !== vars.contactId);
        return { ...current, contacts };
      });
      invalidateCompaniesList(queryClient, orgId);
    },
  });
}
