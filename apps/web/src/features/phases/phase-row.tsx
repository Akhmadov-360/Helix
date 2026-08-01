import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Pencil, Trash2 } from "lucide-react";
import type { PhaseResponse } from "@helix/api-schemas";
import { Badge, Button, Card, cn } from "@helix/ui";
import { useCan } from "../../shared/auth/ability";
import { useT } from "../../shared/i18n";

interface Props {
  phase: PhaseResponse;
  name: string;
  onEdit: (phase: PhaseResponse) => void;
  onDelete: (phase: PhaseResponse) => void;
}

// `Card` не forwardRef — dnd-kit нужен реальный DOM-узел, поэтому ref/drag-атрибуты на обёртке
// (тот же паттерн, что ProjectCard в веха E).
export function PhaseRow({ phase, name, onEdit, onDelete }: Props) {
  const t = useT();
  // §8.2: без Phase.update reorder всё равно отклонит сервер — прячем drag-аффорданс, чтобы не
  // предлагать действие, которое гарантированно вернёт 403.
  const canUpdate = useCan("Phase.update");
  const canDelete = useCan("Phase.delete");
  const disabled = !canUpdate;
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
        <div className="flex items-center gap-2">
          <Badge variant="outline">{phase.type}</Badge>
          {canUpdate && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("phases.form.editAction")}
              onClick={() => onEdit(phase)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          {canDelete && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("phases.delete.action")}
              className="text-muted-foreground hover:text-destructive"
              onClick={() => onDelete(phase)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
