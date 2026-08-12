import { createFileRoute } from "@tanstack/react-router";
import { KbListView } from "../../../features/kb/kb-list-view";
import { kbArticlesQueryOptions } from "../../../features/kb/queries";
import { workspacesQueryOptions } from "../../../features/workspaces/queries";
import { meQueryOptions, useMe } from "../../../shared/auth/session";

export const Route = createFileRoute("/_authenticated/kb/")({
  loader: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions);
    await Promise.all([
      context.queryClient.ensureQueryData(kbArticlesQueryOptions(me.activeOrgId)),
      context.queryClient.ensureQueryData(workspacesQueryOptions(me.activeOrgId)),
    ]);
  },
  component: KbPage,
});

function KbPage() {
  const me = useMe();
  return <KbListView orgId={me.activeOrgId} />;
}
