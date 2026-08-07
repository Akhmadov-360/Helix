import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ContactsView } from "../../../../features/contacts/contacts-view";
import { projectContactsQueryOptions } from "../../../../features/contacts/queries";
import { companiesListQueryOptions } from "../../../../features/companies/queries";
import { workspaceQueryOptions } from "../../../../features/phases/queries";
import { projectQueryOptions } from "../../../../features/project-detail/queries";
import { meQueryOptions, useMe } from "../../../../shared/auth/session";

// Project/co-workers/участники-орги/компании уже прогреты родительским layout-роутом
// ($projectId.tsx) — здесь только своё: workspace (ради audience) и контакты сделки.
export const Route = createFileRoute("/_authenticated/projects/$projectId/contacts")({
  loader: async ({ context, params }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions);
    const project = await context.queryClient.ensureQueryData(
      projectQueryOptions(me.activeOrgId, params.projectId),
    );
    await Promise.all([
      context.queryClient.ensureQueryData(workspaceQueryOptions(me.activeOrgId, project.workspaceId)),
      context.queryClient.ensureQueryData(projectContactsQueryOptions(me.activeOrgId, params.projectId)),
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
    <ContactsView
      orgId={me.activeOrgId}
      projectId={projectId}
      audience={workspace.audience}
      company={project.companyId ? companies.find((c) => c.id === project.companyId) : undefined}
    />
  );
}
