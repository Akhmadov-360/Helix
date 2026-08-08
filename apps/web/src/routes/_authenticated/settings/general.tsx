import { createFileRoute } from "@tanstack/react-router";
import { GeneralSettingsPage } from "../../../features/settings/general-settings-page";
import { orgSettingsQueryOptions } from "../../../features/settings/queries";
import { meQueryOptions, useMe } from "../../../shared/auth/session";

export const Route = createFileRoute("/_authenticated/settings/general")({
  loader: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions);
    await context.queryClient.ensureQueryData(orgSettingsQueryOptions(me.activeOrgId));
  },
  component: GeneralSettingsRoute,
});

function GeneralSettingsRoute() {
  const me = useMe();
  return <GeneralSettingsPage orgId={me.activeOrgId} />;
}
