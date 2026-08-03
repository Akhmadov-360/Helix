import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { companiesListQueryOptions } from "../../../../features/companies/queries";
import { projectAssigneesQueryOptions, projectQueryOptions } from "../../../../features/project-detail/queries";
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
      // Сайдбар project-detail-shell.tsx теперь рендерится на ЛЮБОЙ вкладке (redesign) — грузим
      // его данные (co-workers, компания сделки) здесь тоже, не только на бывшей вкладке Контакты.
      context.queryClient.ensureQueryData(projectAssigneesQueryOptions(me.activeOrgId, params.projectId)),
      context.queryClient.ensureQueryData(orgMembersQueryOptions(me.activeOrgId)),
      context.queryClient.ensureQueryData(companiesListQueryOptions(me.activeOrgId)),
    ]);
  },
  component: TasksPage,
});

function TasksPage() {
  const { projectId } = Route.useParams();
  const me = useMe();
  const { companies } = useSuspenseQuery(companiesListQueryOptions(me.activeOrgId)).data;

  return (
    <ProjectDetailShell orgId={me.activeOrgId} projectId={projectId} companies={companies}>
      <TasksView orgId={me.activeOrgId} projectId={projectId} />
    </ProjectDetailShell>
  );
}
