import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import type {
  ChangeMemberRoleInput,
  CreateInviteInput,
  CreateOrganizationInput,
  Role,
  UpdateOrganizationSettingsInput,
} from "@helix/api-schemas";
import { myOrgResponseSchema, organizationSettingsResponseSchema } from "@helix/api-schemas";
import { queryKeys, request } from "../../shared/api";
import { useT, type MessageKey } from "../../shared/i18n";
import { useSwitchOrg } from "../../shared/org/mutations";
import { toInviteError, toMemberError, toOrgSettingsError } from "./settings-error";

function memberErrorKey(kind: ReturnType<typeof toMemberError>): MessageKey {
  switch (kind) {
    case "permissionDenied":
      return "settings.members.error.permissionDenied";
    case "notFound":
      return "settings.members.error.notFound";
    case "lastOwner":
      return "settings.members.error.lastOwner";
    case "soleOrganization":
      return "settings.members.error.soleOrganization";
    default:
      return "settings.members.error.unexpected";
  }
}

export function useChangeMemberRole(orgId: string) {
  const queryClient = useQueryClient();
  const t = useT();

  return useMutation({
    mutationFn: (vars: { userId: string; role: Role }) =>
      request({
        method: "PATCH",
        path: `/v1/organizations/members/${vars.userId}`,
        body: { role: vars.role } satisfies ChangeMemberRoleInput,
        schema: z.null(),
      }),
    onError: (error) => {
      const kind = toMemberError(error);
      if (kind === "permissionDenied") void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      toast.error(t(memberErrorKey(kind)));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.orgMembers(orgId) });
      // Префикс (без query-параметров) — инвалидирует все вариации фильтра/страницы разом,
      // тот же приём, что invalidateKbLists (features/kb/mutations.ts).
      void queryClient.invalidateQueries({ queryKey: ["org", orgId, "auditLog"] });
      toast.success(t("settings.members.roleChanged"));
    },
  });
}

export function useRemoveMember(orgId: string) {
  const queryClient = useQueryClient();
  const t = useT();

  return useMutation({
    mutationFn: (vars: { userId: string }) =>
      request({ method: "DELETE", path: `/v1/organizations/members/${vars.userId}`, schema: z.null() }),
    onError: (error) => {
      const kind = toMemberError(error);
      if (kind === "permissionDenied") void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      toast.error(t(memberErrorKey(kind)));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.orgMembers(orgId) });
      // Префикс (без query-параметров) — инвалидирует все вариации фильтра/страницы разом,
      // тот же приём, что invalidateKbLists (features/kb/mutations.ts).
      void queryClient.invalidateQueries({ queryKey: ["org", orgId, "auditLog"] });
      toast.success(t("settings.members.removed"));
    },
  });
}

function inviteErrorKey(kind: ReturnType<typeof toInviteError>): MessageKey {
  switch (kind) {
    case "permissionDenied":
      return "settings.members.error.permissionDenied";
    case "notFound":
      return "settings.members.invite.error.notFound";
    case "roleTooHigh":
      return "settings.members.invite.error.roleTooHigh";
    case "alreadyMember":
      return "settings.members.invite.error.alreadyMember";
    default:
      return "settings.members.error.unexpected";
  }
}

// resend = revoke старого pending на тот же email + create нового, одной операцией на бэке
// (invites.md §1) — фронту не нужно ничего решать, просто зовёт create ещё раз.
export function useCreateInvite(orgId: string) {
  const queryClient = useQueryClient();
  const t = useT();

  return useMutation({
    mutationFn: (input: CreateInviteInput) =>
      request({ method: "POST", path: "/v1/organizations/invites", body: input, schema: z.null() }),
    onError: (error) => {
      const kind = toInviteError(error);
      if (kind === "permissionDenied") void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      // alreadyMember/roleTooHigh — доменные fault'ы формы, dialog рендерит их inline-баннером
      // рядом с полями; повторный toast был бы шумом. Остальные (permission/notFound/unexpected)
      // — глобальные, показываем toast'ом (диалог мог быть закрыт к моменту ответа).
      if (kind === "alreadyMember" || kind === "roleTooHigh") return;
      toast.error(t(inviteErrorKey(kind)));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.orgInvites(orgId) });
      toast.success(t("settings.members.invite.sent"));
    },
  });
}

export function useRevokeInvite(orgId: string) {
  const queryClient = useQueryClient();
  const t = useT();

  return useMutation({
    mutationFn: (vars: { id: string }) =>
      request({ method: "DELETE", path: `/v1/organizations/invites/${vars.id}`, schema: z.null() }),
    onError: (error) => {
      const kind = toInviteError(error);
      if (kind === "permissionDenied") void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      toast.error(t(inviteErrorKey(kind)));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.orgInvites(orgId) });
      toast.success(t("settings.members.pending.revoked"));
    },
  });
}

function orgSettingsErrorKey(kind: ReturnType<typeof toOrgSettingsError>): MessageKey {
  switch (kind) {
    case "permissionDenied":
      return "settings.members.error.permissionDenied";
    case "validation":
      return "settings.general.error.validation";
    default:
      return "settings.members.error.unexpected";
  }
}

// PATCH-семантика на бэке (партиальный merge) — форма шлёт всегда все 4 группы полей разом,
// т.к. это единственная форма-редактор settings (не построчный список, как invites/members).
export function useUpdateOrgSettings(orgId: string) {
  const queryClient = useQueryClient();
  const t = useT();

  return useMutation({
    mutationFn: (input: UpdateOrganizationSettingsInput) =>
      request({
        method: "PATCH",
        path: "/v1/organizations/settings",
        body: input,
        schema: organizationSettingsResponseSchema,
      }),
    onError: (error) => {
      const kind = toOrgSettingsError(error);
      if (kind === "permissionDenied") void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      toast.error(t(orgSettingsErrorKey(kind)));
    },
    onSuccess: (settings) => {
      queryClient.setQueryData(queryKeys.orgSettings(orgId), settings);
      // name может смениться — sidebar/org-switcher читают отдельный список (myOrgs), не settings.
      void queryClient.invalidateQueries({ queryKey: queryKeys.myOrgs() });
      toast.success(t("settings.general.saved"));
    },
  });
}

// FR-ORG-2: создание переключает на новую оргу сразу (useSwitchOrg делает full reload на "/") —
// иначе юзер создал бы оргу и остался в старой, не понимая, куда делась новая.
export function useCreateOrganization() {
  const queryClient = useQueryClient();
  const t = useT();
  const switchOrg = useSwitchOrg();

  return useMutation({
    mutationFn: (input: CreateOrganizationInput) =>
      request({ method: "POST", path: "/v1/organizations", body: input, schema: myOrgResponseSchema }),
    onError: () => toast.error(t("settings.createOrg.error.unexpected")),
    onSuccess: (org) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.myOrgs() });
      switchOrg.mutate({ orgId: org.orgId });
    },
  });
}
