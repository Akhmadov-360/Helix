import { createFileRoute } from "@tanstack/react-router";
import { PagesListView } from "../../../../../features/pages/pages-list-view";
import { projectPagesQueryOptions } from "../../../../../features/pages/queries";
import { meQueryOptions, useMe } from "../../../../../shared/auth/session";

// Project уже прогрет родительским layout-роутом ($projectId.tsx) — здесь только список страниц.
export const Route = createFileRoute("/_authenticated/projects/$projectId/pages/")({
  loader: async ({ context, params }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions);
    await context.queryClient.ensureQueryData(projectPagesQueryOptions(me.activeOrgId, params.projectId));
  },
  component: PagesIndexPage,
});

function PagesIndexPage() {
  const { projectId } = Route.useParams();
  const me = useMe();

  return <PagesListView orgId={me.activeOrgId} projectId={projectId} />;
}
