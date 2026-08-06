import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import type { ChangeMemberRoleInput, CreateOrganizationInput, Role } from "@helix/api-schemas";
import { myOrgResponseSchema } from "@helix/api-schemas";
import { queryKeys, request } from "../../shared/api";
import { useT, type MessageKey } from "../../shared/i18n";
import { useSwitchOrg } from "../../shared/org/mutations";
import { toMemberError } from "./settings-error";

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
      void queryClient.invalidateQueries({ queryKey: queryKeys.auditLog(orgId) });
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
      void queryClient.invalidateQueries({ queryKey: queryKeys.auditLog(orgId) });
      toast.success(t("settings.members.removed"));
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
