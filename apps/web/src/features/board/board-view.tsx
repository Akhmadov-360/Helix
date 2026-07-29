import { useSuspenseQuery } from "@tanstack/react-query";
import { useT } from "../../shared/i18n";
import { useLocalize } from "../../shared/lib/localize";
import { boardQueryOptions } from "./queries";
import { ProjectCard } from "./project-card";
import { toBoardViewModel } from "./select";

// Read-only (веха D): без drag/move — это ADR-FE-2 / веха E.
export function BoardView({ orgId, workspaceId }: { orgId: string; workspaceId: string }) {
  const board = useSuspenseQuery({ ...boardQueryOptions(orgId, workspaceId), select: toBoardViewModel }).data;
  const localize = useLocalize();
  const t = useT();

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {board.columns.map((column) => (
        <section key={column.id} className="flex w-72 shrink-0 flex-col gap-3">
          <header className="flex items-center justify-between px-1">
            <h2 className="text-sm font-semibold">{localize(column.phaseName)}</h2>
            <span className="text-xs text-muted-foreground">
              {t("board.column.count", { count: column.projects.length, total: column.total })}
            </span>
          </header>
          <div className="flex flex-col gap-2" role="list">
            {column.projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
