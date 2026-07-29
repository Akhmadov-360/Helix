import { createFileRoute } from "@tanstack/react-router";
import { workspaceQueryOptions } from "../../../../../features/phases/queries";
import { PhasesView } from "../../../../../features/phases/phases-view";
import { meQueryOptions, useMe } from "../../../../../shared/auth/session";
import { useT } from "../../../../../shared/i18n";

export const Route = createFileRoute("/_authenticated/workspaces/$workspaceId/settings/phases")({
  loader: async ({ context, params }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions);
    await context.queryClient.ensureQueryData(workspaceQueryOptions(me.activeOrgId, params.workspaceId));
  },
  component: PhasesPage,
});

function PhasesPage() {
  const { workspaceId } = Route.useParams();
  const me = useMe();
  const t = useT();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">{t("phases.title")}</h1>
      <PhasesView orgId={me.activeOrgId} workspaceId={workspaceId} />
    </div>
  );
}
