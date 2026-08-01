import { createFileRoute } from "@tanstack/react-router";
import {
  projectActivityQueryOptions,
  projectAssigneesQueryOptions,
  projectQueryOptions,
} from "../../../../features/project-detail/queries";
import { ProjectDetailShell } from "../../../../features/project-detail/project-detail-shell";
import { ActivityView } from "../../../../features/project-detail/activity-view";
import { meQueryOptions, useMe } from "../../../../shared/auth/session";
import { orgMembersQueryOptions } from "../../../../shared/org/queries";

export const Route = createFileRoute("/_authenticated/projects/$projectId/activity")({
  loader: async ({ context, params }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions);
    await Promise.all([
      context.queryClient.ensureQueryData(projectQueryOptions(me.activeOrgId, params.projectId)),
      context.queryClient.ensureQueryData(projectActivityQueryOptions(me.activeOrgId, params.projectId)),
      // Сайдбар project-detail-shell.tsx рендерится на ЛЮБОЙ вкладке (redesign) — грузим его
      // данные (co-workers) и здесь.
      context.queryClient.ensureQueryData(projectAssigneesQueryOptions(me.activeOrgId, params.projectId)),
      context.queryClient.ensureQueryData(orgMembersQueryOptions(me.activeOrgId)),
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
