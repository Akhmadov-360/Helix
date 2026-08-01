import { createFileRoute } from "@tanstack/react-router";
import { boardQueryOptions } from "../../../../features/board/queries";
import { BoardView } from "../../../../features/board/board-view";
import { meQueryOptions, useMe } from "../../../../shared/auth/session";

export const Route = createFileRoute("/_authenticated/workspaces/$workspaceId/board")({
  loader: async ({ context, params }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions);
    await context.queryClient.ensureQueryData(boardQueryOptions(me.activeOrgId, params.workspaceId));
  },
  component: BoardPage,
});

function BoardPage() {
  const { workspaceId } = Route.useParams();
  const me = useMe();
  return <BoardView orgId={me.activeOrgId} workspaceId={workspaceId} />;
}
