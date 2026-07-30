import type { TaskResponse } from "@helix/api-schemas";
import { cn } from "@helix/ui";
import { useLocaleStore, useT } from "../../shared/i18n";

export function TaskRow({
  task,
  assigneeName,
  canUpdate,
  canDelete,
  onToggle,
  onDelete,
}: {
  task: TaskResponse;
  assigneeName: string | undefined;
  canUpdate: boolean;
  canDelete: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  const locale = useLocaleStore((state) => state.locale);

  return (
    <li className="flex items-center gap-2 rounded-md border border-border p-2">
      <input
        type="checkbox"
        checked={task.done}
        disabled={!canUpdate}
        onChange={onToggle}
        className="h-4 w-4 shrink-0"
      />
      <span className={cn("flex-1 text-sm", task.done && "text-muted-foreground line-through")}>
        {task.title}
      </span>
      {task.overdue && (
        <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
          {t("tasks.list.overdue")}
        </span>
      )}
      {task.dueAt && (
        <span className="shrink-0 text-xs text-muted-foreground">
          {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(task.dueAt))}
        </span>
      )}
      <span className="shrink-0 text-xs text-muted-foreground">
        {assigneeName ?? t("tasks.list.assignee.placeholder")}
      </span>
      {canDelete && (
        <button
          type="button"
          onClick={onDelete}
          aria-label={t("tasks.list.delete")}
          className="shrink-0 text-muted-foreground hover:text-destructive"
        >
          ×
        </button>
      )}
    </li>
  );
}
