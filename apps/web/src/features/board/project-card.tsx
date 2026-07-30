import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Link } from "@tanstack/react-router";
import { Card, cn } from "@helix/ui";
import { useCan } from "../../shared/auth/ability";
import { useLocaleStore } from "../../shared/i18n";
import type { ProjectCardViewModel } from "./select";

interface Props {
  project: ProjectCardViewModel;
  overlay?: boolean;
}

// `Card` (packages/ui) не forwardRef — dnd-kit нужен реальный DOM-узел, поэтому ref/drag-атрибуты
// на обёртке, Card остаётся чистым визуальным примитивом (композиция, не форк).
export function ProjectCard({ project, overlay = false }: Props) {
  const locale = useLocaleStore((state) => state.locale);
  // §8.2: FE-capability — косметика (сервер всё равно единственный энфорсер move), но без неё
  // юзер без Project.update мог бы бесконечно поднимать/бросать карту, каждый раз получая 403.
  const canMove = useCan("Project.update");
  const disabled = overlay || !canMove;
  const sortable = useSortable({ id: project.id, disabled });

  const style = overlay
    ? undefined
    : { transform: CSS.Translate.toString(sortable.transform), transition: sortable.transition };

  return (
    <div
      ref={overlay ? undefined : sortable.setNodeRef}
      style={style}
      {...(disabled ? {} : sortable.attributes)}
      {...(disabled ? {} : sortable.listeners)}
      role="listitem"
      tabIndex={overlay ? undefined : 0}
      className={cn(
        "touch-none",
        !disabled && "cursor-grab active:cursor-grabbing",
        sortable.isDragging && "opacity-40",
      )}
    >
      <Card className={cn("p-3", overlay && "shadow-lg")}>
        {overlay ? (
          <p className="text-sm font-medium">{project.title}</p>
        ) : (
          <Link
            to="/projects/$projectId/overview"
            params={{ projectId: project.id }}
            className="text-sm font-medium hover:underline"
          >
            {project.title}
          </Link>
        )}
        {project.amount && (
          <p className="mt-1 text-xs text-muted-foreground">{formatAmount(project.amount, locale)}</p>
        )}
      </Card>
    </div>
  );
}

function formatAmount(amount: { value: number; currency: string }, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: amount.currency }).format(amount.value);
}
