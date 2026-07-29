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
}

// Droppable на весь контейнер колонки (не только на карты) — иначе пустая/короткая колонка
// не даёт дропнуть между картами и после последней (§7).
export function BoardColumn({ column, name, order, projectsById }: Props) {
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
    </section>
  );
}
