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
  onLoadMore: () => void;
  loadingMore: boolean;
}

// Droppable на весь контейнер колонки (не только на карты) — иначе пустая/короткая колонка
// не даёт дропнуть между картами и после последней (§7).
export function BoardColumn({ column, name, order, projectsById, onLoadMore, loadingMore }: Props) {
  const t = useT();
  const { setNodeRef } = useDroppable({ id: column.id });

  return (
    <section className="flex w-72 shrink-0 flex-col gap-3">
      <header className="flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold">{name}</h2>
        <span className="text-xs text-muted-foreground">
          {t("board.column.count", { count: column.projects.length, total: column.total })}
        </span>
      </header>
      <SortableContext id={column.id} items={order} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="flex min-h-8 flex-col gap-2" role="list">
          {order.map((id) => {
            const project = projectsById.get(id);
            return project ? <ProjectCard key={id} project={project} /> : null;
          })}
        </div>
      </SortableContext>
      {column.hasMore && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={loadingMore}
          className="rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
        >
          {loadingMore ? t("board.column.loadingMore") : t("board.column.loadMore")}
        </button>
      )}
    </section>
  );
}
