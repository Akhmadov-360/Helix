import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { companiesListQueryOptions } from "../../../../features/companies/queries";
import { boardQueryOptions } from "../../../../features/board/queries";
import { BoardShell, type BoardDisplayMode } from "../../../../features/board/board-shell";
import { meQueryOptions, useMe } from "../../../../shared/auth/session";

export interface BoardSearch {
  view?: BoardDisplayMode;
}

// companies грузится тут (не внутри features/board) для company-пикера на создании/редактировании
// сделки (FR-CC-2) — та же композиция на уровне routes/, что contacts/companies (features/* не
// импортируют друг друга напрямую).
export const Route = createFileRoute("/_authenticated/workspaces/$workspaceId/board")({
  // view=table — deep-linkable (nav: deep-linking); board — дефолт, не засоряем URL "view=board".
  validateSearch: (search: Record<string, unknown>): BoardSearch => ({
    view: search.view === "table" ? "table" : undefined,
  }),
  loader: async ({ context, params }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions);
    await Promise.all([
      context.queryClient.ensureQueryData(boardQueryOptions(me.activeOrgId, params.workspaceId)),
      context.queryClient.ensureQueryData(companiesListQueryOptions(me.activeOrgId)),
    ]);
  },
  component: BoardPage,
});

function BoardPage() {
  const { workspaceId } = Route.useParams();
  const { view } = Route.useSearch();
  const navigate = Route.useNavigate();
  const me = useMe();
  const { companies } = useSuspenseQuery(companiesListQueryOptions(me.activeOrgId)).data;

  return (
    <BoardShell
      orgId={me.activeOrgId}
      workspaceId={workspaceId}
      companies={companies}
      view={view ?? "board"}
      onViewChange={(next) =>
        navigate({ search: (prev) => ({ ...prev, view: next === "board" ? undefined : next }) })
      }
    />
  );
}
