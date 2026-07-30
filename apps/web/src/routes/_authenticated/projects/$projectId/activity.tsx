import { createFileRoute } from "@tanstack/react-router";
import { projectActivityQueryOptions, projectQueryOptions } from "../../../../features/project-detail/queries";
import { ProjectDetailShell } from "../../../../features/project-detail/project-detail-shell";
import { ActivityView } from "../../../../features/project-detail/activity-view";
import { meQueryOptions, useMe } from "../../../../shared/auth/session";

export const Route = createFileRoute("/_authenticated/projects/$projectId/activity")({
  loader: async ({ context, params }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions);
    await Promise.all([
      context.queryClient.ensureQueryData(projectQueryOptions(me.activeOrgId, params.projectId)),
      context.queryClient.ensureQueryData(projectActivityQueryOptions(me.activeOrgId, params.projectId)),
    ]);
  },
  component: ActivityPage,
});

function ActivityPage() {
  const { projectId } = Route.useParams();
  const me = useMe();

  return (
    <ProjectDetailShell orgId={me.activeOrgId} projectId={projectId}>
      <ActivityView orgId={me.activeOrgId} projectId={projectId} />
    </ProjectDetailShell>
  );
}
