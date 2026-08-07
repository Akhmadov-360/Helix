import { createFileRoute } from "@tanstack/react-router";
import { projectTasksQueryOptions } from "../../../../features/tasks/queries";
import { TasksView } from "../../../../features/tasks/tasks-view";
import { meQueryOptions, useMe } from "../../../../shared/auth/session";

// Project/co-workers/участники-орги/компании уже прогреты родительским layout-роутом
// ($projectId.tsx) — здесь только задачи сделки.
export const Route = createFileRoute("/_authenticated/projects/$projectId/tasks")({
  loader: async ({ context, params }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions);
    await context.queryClient.ensureQueryData(projectTasksQueryOptions(me.activeOrgId, params.projectId));
  },
  component: TasksPage,
});

function TasksPage() {
  const { projectId } = Route.useParams();
  const me = useMe();

  return <TasksView orgId={me.activeOrgId} projectId={projectId} />;
}
