import { createFileRoute } from "@tanstack/react-router";
import { MembersPage } from "../../../features/settings/members-page";
import { orgMembersQueryOptions } from "../../../shared/org/queries";
import { meQueryOptions, useMe } from "../../../shared/auth/session";

export const Route = createFileRoute("/_authenticated/settings/members")({
  loader: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions);
    await context.queryClient.ensureQueryData(orgMembersQueryOptions(me.activeOrgId));
  },
  component: MembersRoute,
});

function MembersRoute() {
  const me = useMe();
  return <MembersPage orgId={me.activeOrgId} />;
}
