import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { PhaseResponse } from "@helix/api-schemas";
import { Card, cn } from "@helix/ui";

interface Props {
  phase: PhaseResponse;
  name: string;
}

// `Card` не forwardRef — dnd-kit нужен реальный DOM-узел, поэтому ref/drag-атрибуты на обёртке
// (тот же паттерн, что ProjectCard в веха E).
export function PhaseRow({ phase, name }: Props) {
  const { setNodeRef, attributes, listeners, isDragging, transform, transition } = useSortable({ id: phase.id });
  const style = { transform: CSS.Translate.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      role="listitem"
      tabIndex={0}
      className={cn("touch-none cursor-grab active:cursor-grabbing", isDragging && "opacity-40")}
    >
      <Card className="flex items-center justify-between p-3">
        <span className="text-sm font-medium">{name}</span>
        <span className="text-xs uppercase text-muted-foreground">{phase.type}</span>
      </Card>
    </div>
  );
}
