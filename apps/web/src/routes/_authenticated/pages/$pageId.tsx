import { createFileRoute } from "@tanstack/react-router";
import { PageDetailView } from "../../../features/pages/page-detail-view";
import { pageCommentsQueryOptions, pageQueryOptions } from "../../../features/pages/queries";
import { meQueryOptions, useMe } from "../../../shared/auth/session";
import { orgMembersQueryOptions } from "../../../shared/org/queries";

// Вне $projectId-layout (не /projects/$projectId/pages/$pageId) — намеренно: странице комментариев
// нужна вся ширина, без табов сделки и панели "Детали сделки" (design review). projectId для
// кнопки "назад к списку" берём из самой PageResponse (там уже есть поле), не из URL — отдельный
// route-параметр под то же значение был бы дублирующим источником истины.
export const Route = createFileRoute("/_authenticated/pages/$pageId")({
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
  const { pageId } = Route.useParams();
  const me = useMe();
  return <PageDetailView orgId={me.activeOrgId} pageId={pageId} />;
}
