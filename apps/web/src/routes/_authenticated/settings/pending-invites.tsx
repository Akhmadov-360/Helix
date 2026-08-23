import { createFileRoute, redirect } from "@tanstack/react-router";
import { PendingInvitesPage } from "../../../features/settings/pending-invites-page";
import { orgInvitesQueryOptions } from "../../../features/settings/queries";
import { meQueryOptions, useMe } from "../../../shared/auth/session";

export const Route = createFileRoute("/_authenticated/settings/pending-invites")({
  // Invite.read = O/A only (invites.md §5) — если у роли нет доступа, редиректим обратно на
  // Members, где такой юзер попал бы на страницу без контента (эта страница смысла не имеет).
  loader: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions);
    if (!me.capabilities.includes("Invite.read")) {
      throw redirect({ to: "/settings/members" });
    }
    await context.queryClient.ensureQueryData(orgInvitesQueryOptions(me.activeOrgId));
  },
  component: PendingInvitesRoute,
});

function PendingInvitesRoute() {
  const me = useMe();
  return <PendingInvitesPage orgId={me.activeOrgId} />;
}
