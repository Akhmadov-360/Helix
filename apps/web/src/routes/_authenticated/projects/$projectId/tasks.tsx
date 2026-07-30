import { createFileRoute } from "@tanstack/react-router";
import { projectQueryOptions } from "../../../../features/project-detail/queries";
import { ProjectDetailShell } from "../../../../features/project-detail/project-detail-shell";
import { projectTasksQueryOptions } from "../../../../features/tasks/queries";
import { TasksView } from "../../../../features/tasks/tasks-view";
import { meQueryOptions, useMe } from "../../../../shared/auth/session";
import { orgMembersQueryOptions } from "../../../../shared/org/queries";

export const Route = createFileRoute("/_authenticated/projects/$projectId/tasks")({
  loader: async ({ context, params }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions);
    await Promise.all([
      context.queryClient.ensureQueryData(projectQueryOptions(me.activeOrgId, params.projectId)),
      context.queryClient.ensureQueryData(projectTasksQueryOptions(me.activeOrgId, params.projectId)),
      context.queryClient.ensureQueryData(orgMembersQueryOptions(me.activeOrgId)),
    ]);
  },
  component: TasksPage,
});

function TasksPage() {
  const { projectId } = Route.useParams();
  const me = useMe();

  return (
    <ProjectDetailShell orgId={me.activeOrgId} projectId={projectId}>
      <TasksView orgId={me.activeOrgId} projectId={projectId} />
    </ProjectDetailShell>
  );
}
