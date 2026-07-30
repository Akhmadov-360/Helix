import { createFileRoute } from "@tanstack/react-router";
import { projectQueryOptions } from "../../../../features/project-detail/queries";
import { ProjectDetailShell } from "../../../../features/project-detail/project-detail-shell";
import { OverviewView } from "../../../../features/project-detail/overview-view";
import { meQueryOptions, useMe } from "../../../../shared/auth/session";

export const Route = createFileRoute("/_authenticated/projects/$projectId/overview")({
  loader: async ({ context, params }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions);
    await context.queryClient.ensureQueryData(projectQueryOptions(me.activeOrgId, params.projectId));
  },
  component: OverviewPage,
});

function OverviewPage() {
  const { projectId } = Route.useParams();
  const me = useMe();

  return (
    <ProjectDetailShell orgId={me.activeOrgId} projectId={projectId}>
      <OverviewView orgId={me.activeOrgId} projectId={projectId} />
    </ProjectDetailShell>
  );
}
