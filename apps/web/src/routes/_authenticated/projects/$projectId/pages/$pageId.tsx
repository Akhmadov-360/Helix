import { createFileRoute } from "@tanstack/react-router";
import { pageCommentsQueryOptions, pageQueryOptions } from "../../../../../features/pages/queries";
import { PageDetailView } from "../../../../../features/pages/page-detail-view";
import { meQueryOptions, useMe } from "../../../../../shared/auth/session";
import { orgMembersQueryOptions } from "../../../../../shared/org/queries";

export const Route = createFileRoute("/_authenticated/projects/$projectId/pages/$pageId")({
  loader: async ({ context, params }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions);
    await Promise.all([
      context.queryClient.ensureQueryData(pageQueryOptions(me.activeOrgId, params.pageId)),
      context.queryClient.ensureQueryData(pageCommentsQueryOptions(me.activeOrgId, params.pageId)),
      context.queryClient.ensureQueryData(orgMembersQueryOptions(me.activeOrgId)),
    ]);
  },
  component: PageDetailPage,
});

function PageDetailPage() {
  const { projectId, pageId } = Route.useParams();
  const me = useMe();

  return <PageDetailView orgId={me.activeOrgId} projectId={projectId} pageId={pageId} />;
}
