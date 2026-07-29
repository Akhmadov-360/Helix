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
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useT } from "../../shared/i18n";
import { useLocalize } from "../../shared/lib/localize";
import { BoardColumn } from "./board-column";
import { useMoveProject } from "./mutations";
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

// Интерактивная доска (веха E, ADR-FE-2): DOM даёт намерение (курсор над картой X), move
// считается по id-соседям в финальном порядке — rank целиком server-owned (§7).
export function BoardView({ orgId, workspaceId }: { orgId: string; workspaceId: string }) {
  const board = useSuspenseQuery({ ...boardQueryOptions(orgId, workspaceId), select: toBoardViewModel }).data;
  const move = useMoveProject(orgId, workspaceId);
  const localize = useLocalize();
  const t = useT();

  const columnsById = useMemo(() => new Map(board.columns.map((c) => [c.id, c])), [board]);
  const projectsById = useMemo(
    () => new Map(board.columns.flatMap((c) => c.projects.map((p) => [p.id, p] as const))),
    [board],
  );
  const serverOrder = useMemo(() => toColumnOrder(board.columns), [board]);

  // Локальный клон порядка — только на время drag (мультиконтейнерный dnd-kit паттерн); после
  // drop снимок сбрасывается, рендер снова идёт от query-кэша (который optimistic-мутация уже
  // пропатчила тем же порядком) — не два независимых источника истины.
  const [drag, setDrag] = useState<{ order: ColumnOrder; activeId: string } | null>(null);
  const order = drag?.order ?? serverOrder;

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
  const announcements: Announcements = {
    onDragStart: ({ active }) => t("board.dnd.picked", { title: projectTitleOf(String(active.id)) }),
    onDragOver: ({ active, over }) => {
      if (!over) return "";
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
      if (!over) return t("board.dnd.cancelled", { title: projectTitleOf(String(active.id)) });
      const columnId = findColumnId(order, String(over.id)) ?? String(over.id);
      return t("board.dnd.dropped", { title: projectTitleOf(String(active.id)), column: columnNameOf(columnId) });
    },
    onDragCancel: ({ active }) => t("board.dnd.cancelled", { title: projectTitleOf(String(active.id)) }),
  };

  function handleDragStart(event: DragStartEvent) {
    setDrag({ order: toColumnOrder(board.columns), activeId: String(event.active.id) });
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over || !drag) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const fromColumnId = findColumnId(drag.order, activeId);
    const toColumnId = findColumnId(drag.order, overId) ?? (columnsById.has(overId) ? overId : null);
    if (!fromColumnId || !toColumnId || fromColumnId === toColumnId) return;

    setDrag((prev) => {
      if (!prev) return prev;
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

  const activeProject = drag ? projectsById.get(drag.activeId) : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      accessibility={{ announcements }}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDrag(null)}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {board.columns.map((column) => (
          <BoardColumn
            key={column.id}
            column={column}
            name={localize(column.phaseName)}
            order={order[column.id] ?? []}
            projectsById={projectsById}
          />
        ))}
      </div>
      <DragOverlay>{activeProject ? <ProjectCard project={activeProject} overlay /> : null}</DragOverlay>
    </DndContext>
  );
}
