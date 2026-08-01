import { useMemo, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import type { PhaseResponse } from "@helix/api-schemas";
import { Button } from "@helix/ui";
import { useCan } from "../../shared/auth/ability";
import { useT } from "../../shared/i18n";
import { useLocalize } from "../../shared/lib/localize";
import { DeletePhaseDialog } from "./delete-phase-dialog";
import { PhaseFormDialog } from "./phase-form-dialog";
import { PhaseRow } from "./phase-row";
import { useReorderPhases } from "./mutations";
import { workspaceQueryOptions } from "./queries";

// Один контейнер (не мульти-колонка, как канбан веха E) — вертикальный reorder поверх
// Phase(workspaceId, order) UNIQUE DEFERRABLE: reorder шлёт весь порядок разом (§5.1).
export function PhasesView({ orgId, workspaceId }: { orgId: string; workspaceId: string }) {
  const workspace = useSuspenseQuery(workspaceQueryOptions(orgId, workspaceId)).data;
  const reorder = useReorderPhases(orgId, workspaceId);
  const localize = useLocalize();
  const t = useT();
  const canCreate = useCan("Phase.create");
  const [formOpen, setFormOpen] = useState(false);
  const [editingPhase, setEditingPhase] = useState<PhaseResponse | null>(null);
  const [deletingPhase, setDeletingPhase] = useState<PhaseResponse | null>(null);

  function openCreate() {
    setEditingPhase(null);
    setFormOpen(true);
  }

  function openEdit(phase: PhaseResponse) {
    setEditingPhase(phase);
    setFormOpen(true);
  }

  const phasesById = useMemo(() => new Map((workspace.phases ?? []).map((phase) => [phase.id, phase])), [workspace]);
  const serverIds = useMemo(() => (workspace.phases ?? []).map((phase) => phase.id), [workspace]);
  const [localIds, setLocalIds] = useState<string[] | null>(null);
  const ids = localIds ?? serverIds;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function nameOf(id: string): string {
    const phase = phasesById.get(id);
    return phase ? localize(phase.name) : "";
  }

  const announcements: Announcements = {
    onDragStart: ({ active }) => t("phases.dnd.picked", { title: nameOf(String(active.id)) }),
    onDragOver: ({ active, over }) => {
      if (!over) return "";
      const position = ids.indexOf(String(over.id)) + 1;
      return t("phases.dnd.movedOver", { title: nameOf(String(active.id)), position, total: ids.length });
    },
    onDragEnd: ({ active, over }) => {
      if (!over) return t("phases.dnd.cancelled", { title: nameOf(String(active.id)) });
      const position = ids.indexOf(String(over.id)) + 1;
      return t("phases.dnd.dropped", { title: nameOf(String(active.id)), position, total: ids.length });
    },
    onDragCancel: ({ active }) => t("phases.dnd.cancelled", { title: nameOf(String(active.id)) }),
  };

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;

    const nextIds = arrayMove(ids, oldIndex, newIndex);
    setLocalIds(nextIds);
    reorder.mutate({ phaseIds: nextIds, version: workspace.version }, { onSettled: () => setLocalIds(null) });
  }

  return (
    <div className="flex max-w-md flex-col gap-3">
      {canCreate && (
        <Button type="button" size="sm" variant="outline" className="w-fit" onClick={openCreate}>
          <Plus className="h-3.5 w-3.5" />
          {t("phases.create.trigger")}
        </Button>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        accessibility={{ announcements }}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2" role="list">
            {ids.map((id) => {
              const phase = phasesById.get(id);
              return phase ? (
                <PhaseRow key={id} phase={phase} name={nameOf(id)} onEdit={openEdit} onDelete={setDeletingPhase} />
              ) : null;
            })}
          </div>
        </SortableContext>
      </DndContext>

      <PhaseFormDialog
        orgId={orgId}
        workspaceId={workspaceId}
        phase={editingPhase}
        open={formOpen}
        onOpenChange={setFormOpen}
      />
      <DeletePhaseDialog
        orgId={orgId}
        workspaceId={workspaceId}
        phase={deletingPhase}
        open={deletingPhase !== null}
        onOpenChange={(next) => {
          if (!next) setDeletingPhase(null);
        }}
      />
    </div>
  );
}
