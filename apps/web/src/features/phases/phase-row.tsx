import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { PhaseResponse } from "@helix/api-schemas";
import { Card, cn } from "@helix/ui";
import { useCan } from "../../shared/auth/ability";

interface Props {
  phase: PhaseResponse;
  name: string;
}

// `Card` не forwardRef — dnd-kit нужен реальный DOM-узел, поэтому ref/drag-атрибуты на обёртке
// (тот же паттерн, что ProjectCard в веха E).
export function PhaseRow({ phase, name }: Props) {
  // §8.2: без Phase.update reorder всё равно отклонит сервер — прячем drag-аффорданс, чтобы не
  // предлагать действие, которое гарантированно вернёт 403.
  const disabled = !useCan("Phase.update");
  const { setNodeRef, attributes, listeners, isDragging, transform, transition } = useSortable({
    id: phase.id,
    disabled,
  });
  const style = { transform: CSS.Translate.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(disabled ? {} : attributes)}
      {...(disabled ? {} : listeners)}
      role="listitem"
      tabIndex={0}
      className={cn(
        "touch-none",
        !disabled && "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-40",
      )}
    >
      <Card className="flex items-center justify-between p-3">
        <span className="text-sm font-medium">{name}</span>
        <span className="text-xs uppercase text-muted-foreground">{phase.type}</span>
      </Card>
    </div>
  );
}
