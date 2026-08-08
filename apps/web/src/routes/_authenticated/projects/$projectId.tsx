import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { companiesListQueryOptions } from "../../../features/companies/queries";
import { projectAssigneesQueryOptions, projectQueryOptions } from "../../../features/project-detail/queries";
import { ProjectDetailShell } from "../../../features/project-detail/project-detail-shell";
import { meQueryOptions, useMe } from "../../../shared/auth/session";
import { orgMembersQueryOptions } from "../../../shared/org/queries";

// Persistent layout (как _authenticated.tsx) — ProjectDetailShell (сайдбар + табы) больше не
// пересоздаётся на каждой вкладке contacts/tasks/activity: раньше каждый из трёх листовых роутов
// оборачивал children в свою копию shell, из-за чего ProjectTabs размонтировался и монтировался
// заново при каждом переключении, обнуляя анимированное состояние. Здесь — общие для сайдбара
// данные (co-workers, участники орги, компании), листовые роуты грузят только своё.
export const Route = createFileRoute("/_authenticated/projects/$projectId")({
  loader: async ({ context, params }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions);
    await context.queryClient.ensureQueryData(projectQueryOptions(me.activeOrgId, params.projectId));
    await Promise.all([
      context.queryClient.ensureQueryData(projectAssigneesQueryOptions(me.activeOrgId, params.projectId)),
      context.queryClient.ensureQueryData(orgMembersQueryOptions(me.activeOrgId)),
      context.queryClient.ensureQueryData(companiesListQueryOptions(me.activeOrgId)),
    ]);
  },
  component: ProjectDetailLayout,
});

function ProjectDetailLayout() {
  const { projectId } = Route.useParams();
  const me = useMe();
  const { companies } = useSuspenseQuery(companiesListQueryOptions(me.activeOrgId)).data;

  return (
    <ProjectDetailShell orgId={me.activeOrgId} projectId={projectId} companies={companies}>
      <Outlet />
    </ProjectDetailShell>
  );
}
