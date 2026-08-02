import { createFileRoute } from "@tanstack/react-router";
import { boardQueryOptions } from "../../../../features/board/queries";
import { BoardShell, type BoardDisplayMode } from "../../../../features/board/board-shell";
import { meQueryOptions, useMe } from "../../../../shared/auth/session";

export interface BoardSearch {
  view?: BoardDisplayMode;
}

export const Route = createFileRoute("/_authenticated/workspaces/$workspaceId/board")({
  // view=table — deep-linkable (nav: deep-linking); board — дефолт, не засоряем URL "view=board".
  validateSearch: (search: Record<string, unknown>): BoardSearch => ({
    view: search.view === "table" ? "table" : undefined,
  }),
  loader: async ({ context, params }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions);
    await context.queryClient.ensureQueryData(boardQueryOptions(me.activeOrgId, params.workspaceId));
  },
  component: BoardPage,
});

function BoardPage() {
  const { workspaceId } = Route.useParams();
  const { view } = Route.useSearch();
  const navigate = Route.useNavigate();
  const me = useMe();

  return (
    <BoardShell
      orgId={me.activeOrgId}
      workspaceId={workspaceId}
      view={view ?? "board"}
      onViewChange={(next) =>
        navigate({ search: (prev) => ({ ...prev, view: next === "board" ? undefined : next }) })
      }
    />
  );
}
