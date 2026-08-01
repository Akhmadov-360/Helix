import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import type { CreateContactInput, DealRole, ProjectContactResponse } from "@helix/api-schemas";
import { contactResponseSchema, createContactResponseSchema, projectContactResponseSchema } from "@helix/api-schemas";
import { queryKeys, request } from "../../shared/api";
import { useT, type MessageKey } from "../../shared/i18n";
import { useToast } from "../../shared/toast/use-toast";
import { projectContactsQueryOptions } from "./queries";
import { toContactError, toLinkContactError } from "./contact-error";

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
  const toast = useToast();

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
  const toast = useToast();

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
  const toast = useToast();

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
// связывает create → link отдельным шагом (POST /contacts затем POST /projects/:id/contacts).
// Без orgId-параметра: POST /contacts org-scoped через токен, кэш-ключ ему не нужен.
export function useCreateContact() {
  const t = useT();
  const toast = useToast();

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
  });
}

// §13.3: сливает новый контакт (source) В кандидата (target) — POST /contacts/:targetId/merge.
// Редирект связей (ProjectContact.contactId source→target) делает бэк (contacts.md §7.3);
// фронту достаточно инвалидировать projectContacts, чтобы подхватить актуальный contactId/имя.
export function useMergeContact(orgId: string, projectId: string) {
  const queryClient = useQueryClient();
  const t = useT();
  const toast = useToast();

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

