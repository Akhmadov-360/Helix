import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import type { ContactListResponse, CreateContactInput, DealRole, ProjectContactResponse, UpdateContactInput } from "@helix/api-schemas";
import { contactListResponseSchema, contactResponseSchema, createContactResponseSchema, projectContactResponseSchema } from "@helix/api-schemas";
import { queryKeys, request } from "../../shared/api";
import { useT, type MessageKey } from "../../shared/i18n";
import { toast } from "sonner";
import { contactQueryOptions, projectContactsQueryOptions, type ContactsListQuery } from "./queries";
import { toContactError, toLinkContactError } from "./contact-error";

// Список — единственный query-key с параметрами (contactsList(orgId, query), см. query-keys.ts),
// тот же приём, что companies/mutations.ts: инвалидируем по общему префиксу, а не setQueryData,
// раз конкретный q/companyId-фильтр вызывающему компоненту неизвестен.
export function invalidateContactsList(queryClient: ReturnType<typeof useQueryClient>, orgId: string) {
  void queryClient.invalidateQueries({ queryKey: ["org", orgId, "contacts", "list"] });
}

function linkErrorKey(err: ReturnType<typeof toLinkContactError>): MessageKey {
  switch (err.kind) {
    case "merged":
      return "contacts.error.merged";
    case "alreadyLinked":
      return "contacts.error.alreadyLinked";
    case "permissionDenied":
      return "contacts.error.permissionDenied";
    case "notFound":
      return "contacts.error.notFound";
    default:
      return "contacts.error.unexpected";
  }
}

function contactErrorKey(kind: ReturnType<typeof toContactError>): MessageKey {
  switch (kind) {
    case "permissionDenied":
      return "contacts.error.permissionDenied";
    case "notFound":
      return "contacts.error.notFound";
    case "linkedToDeal":
      return "contacts.error.linkedToDeal";
    default:
      return "contacts.error.unexpected";
  }
}

export interface LinkContactVariables {
  contactId: string;
  roles: DealRole[];
  // Оптимистичный снапшот (§7-паттерн, как spliceMove): вызывающий уже знает имя/email/компанию
  // из результата поиска, не нужно ждать ответ сервера, чтобы отрисовать строку.
  optimistic: Omit<ProjectContactResponse, "roles">;
}

export function useLinkContact(orgId: string, projectId: string) {
  const queryClient = useQueryClient();
  const { queryKey } = projectContactsQueryOptions(orgId, projectId);
  const t = useT();

  return useMutation({
    mutationFn: (vars: LinkContactVariables) =>
      request({
        method: "POST",
        path: `/v1/projects/${projectId}/contacts`,
        body: { contactId: vars.contactId, roles: vars.roles },
        schema: projectContactResponseSchema,
      }),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey });
      const snapshot = queryClient.getQueryData<ProjectContactResponse[]>(queryKey);
      queryClient.setQueryData<ProjectContactResponse[]>(queryKey, (current) => [
        ...(current ?? []),
        { ...vars.optimistic, roles: vars.roles },
      ]);
      return { snapshot };
    },
    onError: (error, _vars, ctx) => {
      if (ctx?.snapshot) queryClient.setQueryData(queryKey, ctx.snapshot);
      const err = toLinkContactError(error);
      if (err.kind === "permissionDenied") void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      toast.error(t(linkErrorKey(err)));
    },
    onSuccess: (contact) => {
      queryClient.setQueryData<ProjectContactResponse[]>(
        queryKey,
        (current) => current && current.map((c) => (c.contactId === contact.contactId ? contact : c)),
      );
    },
  });
}

export function useUpdateContactRoles(orgId: string, projectId: string) {
  const queryClient = useQueryClient();
  const { queryKey } = projectContactsQueryOptions(orgId, projectId);
  const t = useT();

  return useMutation({
    mutationFn: (vars: { contactId: string; roles: DealRole[] }) =>
      request({
        method: "PATCH",
        path: `/v1/projects/${projectId}/contacts/${vars.contactId}`,
        body: { roles: vars.roles },
        schema: projectContactResponseSchema,
      }),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey });
      const snapshot = queryClient.getQueryData<ProjectContactResponse[]>(queryKey);
      queryClient.setQueryData<ProjectContactResponse[]>(
        queryKey,
        (current) =>
          current && current.map((c) => (c.contactId === vars.contactId ? { ...c, roles: vars.roles } : c)),
      );
      return { snapshot };
    },
    onError: (error, _vars, ctx) => {
      if (ctx?.snapshot) queryClient.setQueryData(queryKey, ctx.snapshot);
      const kind = toContactError(error);
      if (kind === "permissionDenied") void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      toast.error(t(contactErrorKey(kind)));
    },
    onSuccess: (contact) => {
      queryClient.setQueryData<ProjectContactResponse[]>(
        queryKey,
        (current) => current && current.map((c) => (c.contactId === contact.contactId ? contact : c)),
      );
    },
  });
}

export function useUnlinkContact(orgId: string, projectId: string) {
  const queryClient = useQueryClient();
  const { queryKey } = projectContactsQueryOptions(orgId, projectId);
  const t = useT();

  return useMutation({
    mutationFn: (vars: { contactId: string }) =>
      request({
        method: "DELETE",
        path: `/v1/projects/${projectId}/contacts/${vars.contactId}`,
        schema: z.null(),
      }),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey });
      const snapshot = queryClient.getQueryData<ProjectContactResponse[]>(queryKey);
      queryClient.setQueryData<ProjectContactResponse[]>(
        queryKey,
        (current) => current && current.filter((c) => c.contactId !== vars.contactId),
      );
      return { snapshot };
    },
    onError: (error, _vars, ctx) => {
      if (ctx?.snapshot) queryClient.setQueryData(queryKey, ctx.snapshot);
      const kind = toContactError(error);
      if (kind === "permissionDenied") void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      toast.error(t(contactErrorKey(kind)));
    },
  });
}

// Создание контакта (§13.3) — не трогает projectContacts-кэш сам по себе: вызывающий компонент
// (per-project link-флоу) связывает create → link отдельным шагом (POST /contacts затем
// POST /projects/:id/contacts). orgId нужен только чтобы держать глобальную адресную книгу
// (contactsList) свежей для ОБОИХ входов создания контакта — из проекта и с /contacts напрямую.
export function useCreateContact(orgId: string) {
  const queryClient = useQueryClient();
  const t = useT();

  return useMutation({
    mutationFn: (input: CreateContactInput) =>
      request({
        method: "POST",
        path: "/v1/contacts",
        body: input,
        schema: createContactResponseSchema,
      }),
    onError: (error) => {
      const kind = toContactError(error);
      toast.error(t(contactErrorKey(kind)));
    },
    onSuccess: () => invalidateContactsList(queryClient, orgId),
  });
}

export function useUpdateContact(orgId: string) {
  const queryClient = useQueryClient();
  const t = useT();

  return useMutation({
    mutationFn: (vars: { contactId: string; input: UpdateContactInput }) =>
      request({
        method: "PATCH",
        path: `/v1/contacts/${vars.contactId}`,
        body: vars.input,
        schema: contactResponseSchema,
      }),
    onError: (error) => {
      const kind = toContactError(error);
      if (kind === "permissionDenied") void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      toast.error(t(contactErrorKey(kind)));
    },
    onSuccess: (contact) => {
      queryClient.setQueryData(contactQueryOptions(orgId, contact.id).queryKey, contact);
      invalidateContactsList(queryClient, orgId);
      toast.success(t("contacts.edit.success"));
    },
  });
}

export function useDeleteContact(orgId: string) {
  const queryClient = useQueryClient();
  const t = useT();

  return useMutation({
    mutationFn: (vars: { contactId: string }) =>
      request({ method: "DELETE", path: `/v1/contacts/${vars.contactId}`, schema: z.null() }),
    onError: (error) => {
      const kind = toContactError(error);
      if (kind === "permissionDenied") void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      toast.error(t(contactErrorKey(kind)));
    },
    onSuccess: (_data, vars) => {
      queryClient.setQueriesData<ContactListResponse>(
        { queryKey: ["org", orgId, "contacts", "list"] },
        (current) => current && { ...current, contacts: current.contacts.filter((c) => c.id !== vars.contactId) },
      );
      invalidateContactsList(queryClient, orgId);
      toast.success(t("contacts.delete.success"));
    },
  });
}

// Тот же POST /contacts/:targetId/merge, что useMergeContact ниже — но без привязки к сделке:
// вызывается со страницы /contacts (глобальная адресная книга), а не из карточки лида, поэтому
// инвалидирует contactsList, а не кэш конкретного проекта.
export function useMergeContactGlobal(orgId: string) {
  const queryClient = useQueryClient();
  const t = useT();

  return useMutation({
    mutationFn: (vars: { targetId: string; sourceId: string }) =>
      request({
        method: "POST",
        path: `/v1/contacts/${vars.targetId}/merge`,
        body: { sourceId: vars.sourceId },
        schema: contactResponseSchema,
      }),
    onError: (error) => {
      const kind = toContactError(error);
      toast.error(t(contactErrorKey(kind)));
    },
    onSuccess: () => invalidateContactsList(queryClient, orgId),
  });
}

// §13.3: сливает новый контакт (source) В кандидата (target) — POST /contacts/:targetId/merge.
// Редирект связей (ProjectContact.contactId source→target) делает бэк (contacts.md §7.3);
// фронту достаточно инвалидировать projectContacts, чтобы подхватить актуальный contactId/имя.
export function useMergeContact(orgId: string, projectId: string) {
  const queryClient = useQueryClient();
  const t = useT();

  return useMutation({
    mutationFn: (vars: { targetId: string; sourceId: string }) =>
      request({
        method: "POST",
        path: `/v1/contacts/${vars.targetId}/merge`,
        body: { sourceId: vars.sourceId },
        schema: contactResponseSchema,
      }),
    onError: (error) => {
      const kind = toContactError(error);
      toast.error(t(contactErrorKey(kind)));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectContactsQueryOptions(orgId, projectId).queryKey });
    },
  });
}

// Курсорная догрузка (§2, тот же приём, что board's useLoadMoreColumn): один query-key на весь
// фильтр {q, companyId} (query-keys.ts contactsList), страницы дописываются в его кэш — смена
// поиска меняет query-key целиком и сама сбрасывает пагинацию, отдельно сбрасывать курсор не надо.
export function useLoadMoreContacts(orgId: string, query: ContactsListQuery) {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.contactsList(orgId, query);

  return useMutation({
    mutationFn: () => {
      const current = queryClient.getQueryData<ContactListResponse>(queryKey);
      const cursorId = current?.contacts.at(-1)?.id;
      return request({
        path: "/v1/contacts",
        searchParams: { ...query, cursorId },
        schema: contactListResponseSchema,
      });
    },
    onSuccess: (page) => {
      queryClient.setQueryData<ContactListResponse>(queryKey, (existing) =>
        existing
          ? { contacts: [...existing.contacts, ...page.contacts], hasMore: page.hasMore }
          : page,
      );
    },
  });
}

