import { createFileRoute } from "@tanstack/react-router";
import { orgInvitesQueryOptions, orgMembersDetailedQueryOptions } from "../../../features/settings/queries";
import { MembersPage } from "../../../features/settings/members-page";
import { meQueryOptions, useMe } from "../../../shared/auth/session";

export const Route = createFileRoute("/_authenticated/settings/members")({
  loader: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions);
    await context.queryClient.ensureQueryData(orgMembersDetailedQueryOptions(me.activeOrgId));
    // Invite.read = O/A only (invites.md §5), а MembersPage открыта всем ролям — прогреваем
    // только если разрешено, иначе suspense-запрос 403-нет прямо на загрузке страницы.
    if (me.capabilities.includes("Invite.read")) {
      await context.queryClient.ensureQueryData(orgInvitesQueryOptions(me.activeOrgId));
    }
  },
  component: MembersRoute,
});

function MembersRoute() {
  const me = useMe();
  return <MembersPage orgId={me.activeOrgId} />;
}
