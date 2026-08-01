import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useT } from "../../shared/i18n";
import { ProjectCard } from "./project-card";
import type { BoardColumnViewModel, ProjectCardViewModel } from "./select";

interface Props {
  column: BoardColumnViewModel;
  name: string;
  order: string[];
  projectsById: Map<string, ProjectCardViewModel>;
  orgId: string;
  workspaceId: string;
  onLoadMore: () => void;
  loadingMore: boolean;
}

// Droppable на весь контейнер колонки (не только на карты) — иначе пустая/короткая колонка
// не даёт дропнуть между картами и после последней (§7). h-full: колонка растягивается на всю
// высоту доски (app-shell.tsx: h-dvh), внутренний список скроллится сам — без этого доска
// «плавала» вместе со страницей вместо фиксированного containment.
export function BoardColumn({ column, name, order, projectsById, orgId, workspaceId, onLoadMore, loadingMore }: Props) {
  const t = useT();
  const { setNodeRef } = useDroppable({ id: column.id });

  return (
    <section className="flex h-full w-72 shrink-0 flex-col rounded-lg border-r border-border bg-muted/40">
      <header className="flex items-center justify-between border-b border-border/60 px-3 pb-3 pt-3">
        <h2 className="text-sm font-semibold">{name}</h2>
        <span className="text-xs text-muted-foreground">
          {t("board.column.count", { count: column.projects.length, total: column.total })}
        </span>
      </header>
      <SortableContext id={column.id} items={order} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="scroll-slim flex-1 space-y-3 overflow-y-auto p-3" role="list">
          {order.map((id) => {
            const project = projectsById.get(id);
            return project ? (
              <ProjectCard key={id} project={project} orgId={orgId} workspaceId={workspaceId} />
            ) : null;
          })}
        </div>
      </SortableContext>
      {column.hasMore && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={loadingMore}
          className="mx-3 mb-3 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
        >
          {loadingMore ? t("board.column.loadingMore") : t("board.column.loadMore")}
        </button>
      )}
    </section>
  );
}
