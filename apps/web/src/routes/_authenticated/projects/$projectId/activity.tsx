import { createFileRoute } from "@tanstack/react-router";
import { projectActivityQueryOptions } from "../../../../features/project-detail/queries";
import { ActivityView } from "../../../../features/project-detail/activity-view";
import { ensureOrgScopedMe, useMe } from "../../../../shared/auth/session";

// Project/co-workers/участники-орги/компании уже прогреты родительским layout-роутом
// ($projectId.tsx) — здесь только лента активности сделки.
export const Route = createFileRoute("/_authenticated/projects/$projectId/activity")({
  loader: async ({ context, params }) => {
    const me = await ensureOrgScopedMe(context.queryClient);
    await context.queryClient.ensureQueryData(projectActivityQueryOptions(me.activeOrgId, params.projectId));
  },
  component: ActivityPage,
});

function ActivityPage() {
  const { projectId } = Route.useParams();
  const me = useMe();

  return <ActivityView orgId={me.activeOrgId} projectId={projectId} />;
}
