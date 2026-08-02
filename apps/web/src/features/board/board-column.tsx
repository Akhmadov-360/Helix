import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { CompanyResponse, PhaseResponse } from "@helix/api-schemas";
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@helix/ui";
import { useCan } from "../../shared/auth/ability";
import { useT } from "../../shared/i18n";
import { DeletePhaseDialog } from "../phases/delete-phase-dialog";
import { PhaseFormDialog } from "../phases/phase-form-dialog";
import { ProjectCard } from "./project-card";
import type { BoardColumnViewModel, ProjectCardViewModel } from "./select";

interface Props {
  column: BoardColumnViewModel;
  name: string;
  order: string[];
  projectsById: Map<string, ProjectCardViewModel>;
  orgId: string;
  workspaceId: string;
  companies: CompanyResponse[];
  onLoadMore: () => void;
  loadingMore: boolean;
}

// Колонка ↔ фаза 1:1 (redesign): rename/delete теперь прямо на доске, переиспользуя те же
// PhaseFormDialog/DeletePhaseDialog, что и /settings/phases — не форк диалогов, только новый вызов.
function toPhaseResponse(column: BoardColumnViewModel): PhaseResponse {
  return {
    id: column.id,
    workspaceId: column.workspaceId,
    key: column.key,
    name: column.phaseName,
    type: column.type,
    order: column.order,
    color: column.color,
  };
}

// Droppable на весь контейнер колонки (не только на карты) — иначе пустая/короткая колонка
// не даёт дропнуть между картами и после последней (§7). h-full: колонка растягивается на всю
// высоту доски (app-shell.tsx: h-dvh), внутренний список скроллится сам — без этого доска
// «плавала» вместе со страницей вместо фиксированного containment.
//
// Колонка САМА — sortable-элемент горизонтального списка (board-view.tsx): drag-хэндл — весь
// header (тот же приём, что ProjectCard — вся карточка тащится, включая ссылку/меню внутри,
// PointerSensor activationConstraint distance:4 не даёт короткому клику стартовать drag).
// useDroppable (карты) остаётся на внутреннем div — другой DOM-узел, конфликта с useSortable нет.
export function BoardColumn({ column, name, order, projectsById, orgId, workspaceId, companies, onLoadMore, loadingMore }: Props) {
  const t = useT();
  const { setNodeRef: setDroppableRef } = useDroppable({ id: column.id });
  const canUpdate = useCan("Phase.update");
  const canDelete = useCan("Phase.delete");
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // §8.2: без Phase.update reorder всё равно отклонит сервер (тот же принцип, что phase-row.tsx) —
  // прячем drag-аффорданс на header, чтобы не предлагать действие, которое гарантированно вернёт 403.
  const dragDisabled = !canUpdate;
  // id колонки-как-sortable-элемента ОБЯЗАН отличаться от id того же column.id, зарегистрированного
  // выше useDroppable — иначе два разных DOM-узла регистрируют один и тот же id в одном DndContext
  // (dnd-kit молча конфликтует, `over` при column-drag резолвится в карту вместо колонки). Префикс
  // "col:" — единственный источник этого id, board-view.tsx (COLUMN_SORTABLE_PREFIX) им же и снимает.
  const { setNodeRef: setSortableRef, attributes, listeners, isDragging, transform, transition } = useSortable({
    id: `col:${column.id}`,
    data: { type: "column", columnId: column.id },
    disabled: dragDisabled,
  });
  const sectionStyle = { transform: CSS.Translate.toString(transform), transition };

  return (
    <section
      ref={setSortableRef}
      style={sectionStyle}
      className={cn(
        "flex h-full w-72 shrink-0 flex-col rounded-lg border-r border-border bg-muted/40",
        isDragging && "opacity-40",
      )}
    >
      <header
        {...(dragDisabled ? {} : attributes)}
        {...(dragDisabled ? {} : listeners)}
        tabIndex={dragDisabled ? undefined : 0}
        className={cn(
          "flex touch-none items-center justify-between border-b border-border/60 px-3 pb-3 pt-3",
          !dragDisabled && "cursor-grab active:cursor-grabbing",
        )}
      >
        <h2 className="text-sm font-semibold">{name}</h2>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">
            {t("board.column.count", { count: column.projects.length, total: column.total })}
          </span>
          {(canUpdate || canDelete) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 text-muted-foreground"
                  aria-label={t("board.column.menu")}
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canUpdate && (
                  <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                    <Pencil className="h-3.5 w-3.5" />
                    {t("board.column.rename")}
                  </DropdownMenuItem>
                )}
                {canDelete && (
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onSelect={() => setDeleteOpen(true)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {t("board.column.delete")}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </header>
      <SortableContext id={column.id} items={order} strategy={verticalListSortingStrategy}>
        <div ref={setDroppableRef} className="scroll-slim flex-1 space-y-3 overflow-y-auto p-3" role="list">
          {order.map((id) => {
            const project = projectsById.get(id);
            return project ? (
              <ProjectCard key={id} project={project} orgId={orgId} workspaceId={workspaceId} companies={companies} />
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
      <PhaseFormDialog
        orgId={orgId}
        workspaceId={workspaceId}
        phase={editOpen ? toPhaseResponse(column) : null}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <DeletePhaseDialog
        orgId={orgId}
        workspaceId={workspaceId}
        phase={deleteOpen ? toPhaseResponse(column) : null}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </section>
  );
}
