import { useMemo, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, horizontalListSortingStrategy, SortableContext, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { Button } from "@helix/ui";
import { useCan } from "../../shared/auth/ability";
import { useT } from "../../shared/i18n";
import { useLocalize } from "../../shared/lib/localize";
import { useReorderPhases } from "../phases/mutations";
import { PhaseFormDialog } from "../phases/phase-form-dialog";
import { BoardColumn } from "./board-column";
import { CreateDealDialog } from "./create-deal-dialog";
import { useLoadMoreColumn, useMoveProject } from "./mutations";
import { ProjectCard } from "./project-card";
import { boardQueryOptions } from "./queries";
import { toBoardViewModel, type BoardColumnViewModel } from "./select";

type ColumnOrder = Record<string, string[]>;

function toColumnOrder(columns: BoardColumnViewModel[]): ColumnOrder {
  return Object.fromEntries(columns.map((column) => [column.id, column.projects.map((p) => p.id)]));
}

function findColumnId(order: ColumnOrder, id: string): string | null {
  return Object.keys(order).find((columnId) => (order[columnId] ?? []).includes(id)) ?? null;
}

// Sortable-id колонки ≠ column.id (board-column.tsx): useDroppable(id: column.id) на теле колонки
// (для дропа карты в пустую колонку) и useSortable колонки в ОДНОМ DndContext не могут делить один
// id — конфликт регистрации. Префикс живёт здесь и в board-column.tsx как единственный источник.
const COLUMN_SORTABLE_PREFIX = "col:";
const toColumnSortableId = (id: string) => `${COLUMN_SORTABLE_PREFIX}${id}`;
const fromColumnSortableId = (id: string) => id.slice(COLUMN_SORTABLE_PREFIX.length);

// Ограничивает collision detection колонками, когда тащат колонку — без этого closestCorners мог
// выбрать `over` геометрически ближайшую КАРТУ внутри соседней колонки (карты и колонки — sortable
// в одном DndContext), и drop с точки зрения пользователя (навёл на колонку) молча не срабатывал бы.
const collisionDetectionStrategy: CollisionDetection = (args) => {
  if (args.active.data.current?.type === "column") {
    const columnContainers = args.droppableContainers.filter((c) => c.data.current?.type === "column");
    return closestCorners({ ...args, droppableContainers: columnContainers });
  }
  return closestCorners(args);
};

// Drag — либо карта (кросс-колоночный, order — Record), либо колонка (один горизонтальный список,
// order — string[], элементы — sortable-id вида "col:<phaseId>") — два разных инварианта в одном
// DndContext (dnd-kit не поддерживает вложенные DndContext), различаем по discriminated union.
type DragState =
  | { kind: "card"; order: ColumnOrder; activeId: string }
  | { kind: "column"; ids: string[]; activeId: string };

// Интерактивная доска (веха E, ADR-FE-2): DOM даёт намерение (курсор над картой X), move
// считается по id-соседям в финальном порядке — rank целиком server-owned (§7).
export function BoardView({ orgId, workspaceId }: { orgId: string; workspaceId: string }) {
  const board = useSuspenseQuery({ ...boardQueryOptions(orgId, workspaceId), select: toBoardViewModel }).data;
  const move = useMoveProject(orgId, workspaceId);
  const reorderColumns = useReorderPhases(orgId, workspaceId);
  const loadMore = useLoadMoreColumn(orgId, workspaceId);
  const localize = useLocalize();
  const t = useT();
  const canCreate = useCan("Project.create");
  const canCreatePhase = useCan("Phase.create");
  const [createOpen, setCreateOpen] = useState(false);
  const [createPhaseOpen, setCreatePhaseOpen] = useState(false);

  const columnsById = useMemo(() => new Map(board.columns.map((c) => [c.id, c])), [board]);
  const projectsById = useMemo(
    () => new Map(board.columns.flatMap((c) => c.projects.map((p) => [p.id, p] as const))),
    [board],
  );
  const serverOrder = useMemo(() => toColumnOrder(board.columns), [board]);
  const serverColumnIds = useMemo(() => board.columns.map((c) => toColumnSortableId(c.id)), [board]);

  // Локальный клон порядка — только на время drag (мультиконтейнерный dnd-kit паттерн); после
  // drop снимок сбрасывается, рендер снова идёт от query-кэша (который optimistic-мутация уже
  // пропатчила тем же порядком) — не два независимых источника истины.
  const [drag, setDrag] = useState<DragState | null>(null);
  const order = drag?.kind === "card" ? drag.order : serverOrder;
  const columnIds = drag?.kind === "column" ? drag.ids : serverColumnIds;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function columnNameOf(columnId: string): string {
    const column = columnsById.get(columnId);
    return column ? localize(column.phaseName) : "";
  }

  function projectTitleOf(id: string): string {
    return projectsById.get(id)?.title ?? "";
  }

  // Live region (§9.1, WCAG 2.1 AA) — dnd-kit озвучивает текст, который мы формируем локализованно.
  // Колонка переиспользует phases.dnd.* (та же семантика "поднята/над позицией N/сброшена", что и
  // на /settings/phases) — не заводим отдельный набор ключей под тот же смысл на другом экране.
  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      active.data.current?.type === "column"
        ? t("phases.dnd.picked", { title: columnNameOf(fromColumnSortableId(String(active.id))) })
        : t("board.dnd.picked", { title: projectTitleOf(String(active.id)) }),
    onDragOver: ({ active, over }) => {
      if (!over) return "";
      if (active.data.current?.type === "column") {
        const position = columnIds.indexOf(String(over.id)) + 1;
        return t("phases.dnd.movedOver", {
          title: columnNameOf(fromColumnSortableId(String(active.id))),
          position,
          total: columnIds.length,
        });
      }
      const columnId = findColumnId(order, String(over.id)) ?? String(over.id);
      const items = order[columnId] ?? [];
      const position = items.indexOf(String(active.id)) + 1;
      return t("board.dnd.movedOver", {
        title: projectTitleOf(String(active.id)),
        column: columnNameOf(columnId),
        position,
        total: items.length,
      });
    },
    onDragEnd: ({ active, over }) => {
      if (active.data.current?.type === "column") {
        if (!over) return t("phases.dnd.cancelled", { title: columnNameOf(fromColumnSortableId(String(active.id))) });
        const position = columnIds.indexOf(String(over.id)) + 1;
        return t("phases.dnd.dropped", {
          title: columnNameOf(fromColumnSortableId(String(active.id))),
          position,
          total: columnIds.length,
        });
      }
      if (!over) return t("board.dnd.cancelled", { title: projectTitleOf(String(active.id)) });
      const columnId = findColumnId(order, String(over.id)) ?? String(over.id);
      return t("board.dnd.dropped", { title: projectTitleOf(String(active.id)), column: columnNameOf(columnId) });
    },
    onDragCancel: ({ active }) =>
      active.data.current?.type === "column"
        ? t("phases.dnd.cancelled", { title: columnNameOf(fromColumnSortableId(String(active.id))) })
        : t("board.dnd.cancelled", { title: projectTitleOf(String(active.id)) }),
  };

  function handleDragStart(event: DragStartEvent) {
    const activeId = String(event.active.id);
    if (event.active.data.current?.type === "column") {
      setDrag({ kind: "column", ids: serverColumnIds, activeId });
    } else {
      setDrag({ kind: "card", order: toColumnOrder(board.columns), activeId });
    }
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over || drag?.kind !== "card") return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const fromColumnId = findColumnId(drag.order, activeId);
    const toColumnId = findColumnId(drag.order, overId) ?? (columnsById.has(overId) ? overId : null);
    if (!fromColumnId || !toColumnId || fromColumnId === toColumnId) return;

    setDrag((prev) => {
      if (prev?.kind !== "card") return prev;
      const source = (prev.order[fromColumnId] ?? []).filter((id) => id !== activeId);
      const target = [...(prev.order[toColumnId] ?? [])];
      const overIndex = target.indexOf(overId);
      target.splice(overIndex === -1 ? target.length : overIndex, 0, activeId);
      return { ...prev, order: { ...prev.order, [fromColumnId]: source, [toColumnId]: target } };
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    const snapshot = drag;
    setDrag(null);
    if (!over || !snapshot) return;

    if (snapshot.kind === "column") {
      const activeId = String(active.id);
      const overId = String(over.id);
      const oldIndex = snapshot.ids.indexOf(activeId);
      const newIndex = snapshot.ids.indexOf(overId);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;
      const nextIds = arrayMove(snapshot.ids, oldIndex, newIndex).map(fromColumnSortableId);
      reorderColumns.mutate({ phaseIds: nextIds, version: board.version });
      return;
    }

    const activeId = String(active.id);
    const overId = String(over.id);
    const fromColumnId = findColumnId(snapshot.order, activeId);
    const toColumnId = findColumnId(snapshot.order, overId) ?? (columnsById.has(overId) ? overId : null);
    if (!fromColumnId || !toColumnId) return;

    // onDragOver уже перенёс activeId в целевую колонку (drag.order), поэтому здесь fromColumnId
    // и toColumnId почти всегда совпадают — cross-column переход детектится ниже через serverOrder,
    // не здесь. arrayMove нужен только для сортировки внутри колонки (over — другая карта, не сам active).
    let finalOrder = snapshot.order;
    if (fromColumnId === toColumnId && overId !== activeId) {
      const items = snapshot.order[fromColumnId] ?? [];
      const oldIndex = items.indexOf(activeId);
      const newIndex = items.indexOf(overId);
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        finalOrder = { ...snapshot.order, [fromColumnId]: arrayMove(items, oldIndex, newIndex) };
      }
    }

    const originalColumnId = findColumnId(serverOrder, activeId);
    const originalIndex = originalColumnId ? (serverOrder[originalColumnId] ?? []).indexOf(activeId) : -1;
    const finalIds = finalOrder[toColumnId] ?? [];
    const finalIndex = finalIds.indexOf(activeId);
    if (originalColumnId === toColumnId && originalIndex === finalIndex) return;

    move.mutate({
      id: activeId,
      fromPhaseId: projectsById.get(activeId)?.phaseId ?? fromColumnId,
      toPhaseId: toColumnId,
      afterId: finalIndex > 0 ? (finalIds[finalIndex - 1] ?? null) : null,
      beforeId: finalIndex < finalIds.length - 1 ? (finalIds[finalIndex + 1] ?? null) : null,
    });
  }

  const activeProject = drag?.kind === "card" ? projectsById.get(drag.activeId) : undefined;
  const activeColumn = drag?.kind === "column" ? columnsById.get(fromColumnSortableId(drag.activeId)) : undefined;

  return (
    // h-full: заполняет main (app-shell.tsx: h-dvh + overflow-y-auto) без второго page-scroll —
    // единственный скролл внутри доски теперь горизонтальный (колонки) и по одной колонке (карты).
    <div className="flex h-full flex-col gap-3">
      {canCreate && (
        <Button type="button" size="sm" className="w-fit shrink-0" onClick={() => setCreateOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          {t("board.create.trigger")}
        </Button>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetectionStrategy}
        accessibility={{ announcements }}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setDrag(null)}
      >
        <SortableContext items={columnIds} strategy={horizontalListSortingStrategy}>
          <div className="scroll-slim flex min-h-0 flex-1 gap-4 overflow-x-auto pb-2">
            {columnIds.map((sortableId) => {
              const id = fromColumnSortableId(sortableId);
              const column = columnsById.get(id);
              return column ? (
                <BoardColumn
                  key={id}
                  column={column}
                  name={localize(column.phaseName)}
                  order={order[id] ?? []}
                  projectsById={projectsById}
                  orgId={orgId}
                  workspaceId={workspaceId}
                  onLoadMore={() => loadMore.mutate({ phaseId: id })}
                  loadingMore={loadMore.isPending && loadMore.variables?.phaseId === id}
                />
              ) : null;
            })}
            {canCreatePhase && (
              <Button
                type="button"
                variant="outline"
                className="h-fit w-72 shrink-0 justify-start"
                onClick={() => setCreatePhaseOpen(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                {t("board.column.addTrigger")}
              </Button>
            )}
          </div>
        </SortableContext>
        <DragOverlay>
          {activeProject ? (
            <ProjectCard project={activeProject} orgId={orgId} workspaceId={workspaceId} overlay />
          ) : activeColumn ? (
            <div className="flex h-12 w-72 shrink-0 items-center rounded-lg border-r border-border bg-muted/40 px-3 shadow-lg">
              <h2 className="text-sm font-semibold">{localize(activeColumn.phaseName)}</h2>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      <CreateDealDialog orgId={orgId} workspaceId={workspaceId} open={createOpen} onOpenChange={setCreateOpen} />
      <PhaseFormDialog
        orgId={orgId}
        workspaceId={workspaceId}
        phase={null}
        open={createPhaseOpen}
        onOpenChange={setCreatePhaseOpen}
      />
    </div>
  );
}
