import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ContactsView } from "../../../../features/contacts/contacts-view";
import { projectContactsQueryOptions } from "../../../../features/contacts/queries";
import { companiesListQueryOptions } from "../../../../features/companies/queries";
import { workspaceQueryOptions } from "../../../../features/phases/queries";
import { projectAssigneesQueryOptions, projectQueryOptions } from "../../../../features/project-detail/queries";
import { ProjectDetailShell } from "../../../../features/project-detail/project-detail-shell";
import { meQueryOptions, useMe } from "../../../../shared/auth/session";
import { orgMembersQueryOptions } from "../../../../shared/org/queries";

export const Route = createFileRoute("/_authenticated/projects/$projectId/contacts")({
  loader: async ({ context, params }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions);
    // workspaceId известен только после project — остальное грузим параллельно (§4.2).
    const project = await context.queryClient.ensureQueryData(
      projectQueryOptions(me.activeOrgId, params.projectId),
    );
    await Promise.all([
      context.queryClient.ensureQueryData(workspaceQueryOptions(me.activeOrgId, project.workspaceId)),
      context.queryClient.ensureQueryData(projectContactsQueryOptions(me.activeOrgId, params.projectId)),
      context.queryClient.ensureQueryData(projectAssigneesQueryOptions(me.activeOrgId, params.projectId)),
      context.queryClient.ensureQueryData(orgMembersQueryOptions(me.activeOrgId)),
      // Сайдбар (компания сделки) и "подсказка" в ContactsView — design review.
      context.queryClient.ensureQueryData(companiesListQueryOptions(me.activeOrgId)),
    ]);
  },
  component: ContactsPage,
});

function ContactsPage() {
  const { projectId } = Route.useParams();
  const me = useMe();
  const project = useSuspenseQuery(projectQueryOptions(me.activeOrgId, projectId)).data;
  const workspace = useSuspenseQuery(workspaceQueryOptions(me.activeOrgId, project.workspaceId)).data;
  const { companies } = useSuspenseQuery(companiesListQueryOptions(me.activeOrgId)).data;

  return (
    <ProjectDetailShell orgId={me.activeOrgId} projectId={projectId} companies={companies}>
      <ContactsView
        orgId={me.activeOrgId}
        projectId={projectId}
        audience={workspace.audience}
        company={project.companyId ? companies.find((c) => c.id === project.companyId) : undefined}
      />
    </ProjectDetailShell>
  );
}
