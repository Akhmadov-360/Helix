import { createFileRoute } from "@tanstack/react-router";
import { KbDetailView } from "../../../features/kb/kb-detail-view";
import { kbArticleQueryOptions } from "../../../features/kb/queries";
import { meQueryOptions, useMe } from "../../../shared/auth/session";

export const Route = createFileRoute("/_authenticated/kb/$articleId")({
  loader: async ({ context, params }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions);
    await context.queryClient.ensureQueryData(kbArticleQueryOptions(me.activeOrgId, params.articleId));
  },
  component: KbArticlePage,
});

function KbArticlePage() {
  const { articleId } = Route.useParams();
  const me = useMe();
  return <KbDetailView orgId={me.activeOrgId} articleId={articleId} />;
}
