import { X } from "lucide-react";
import { useState } from "react";
import type { TaskResponse } from "@helix/api-schemas";
import { Badge, Button, Checkbox, cn } from "@helix/ui";
import { useT } from "../../shared/i18n";
import { AssigneeField } from "./assignee-field";
import { DueDateField } from "./due-date-field";

export function TaskRow({
  task,
  members,
  canUpdate,
  canDelete,
  onToggle,
  onDelete,
  onRename,
  onDueAtChange,
  onAssigneeChange,
}: {
  task: TaskResponse;
  members: { userId: string; name: string }[];
  canUpdate: boolean;
  canDelete: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onRename: (title: string) => void;
  onDueAtChange: (date: Date | null) => void;
  onAssigneeChange: (userId: string | null) => void;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);

  function commitRename() {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== task.title) onRename(next);
    else setDraft(task.title);
  }

  return (
    <li className="group flex items-center gap-2.5 rounded-md px-1 py-1.5 hover:bg-muted/50">
      <Checkbox checked={task.done} disabled={!canUpdate} onCheckedChange={onToggle} className="shrink-0" />

      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") {
              setDraft(task.title);
              setEditing(false);
            }
          }}
          className="flex-1 rounded border border-input bg-background px-1.5 py-0.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      ) : (
        <button
          type="button"
          disabled={!canUpdate}
          onClick={() => canUpdate && setEditing(true)}
          className={cn(
            "flex-1 truncate text-left text-sm disabled:cursor-default",
            task.done && "text-muted-foreground line-through",
          )}
        >
          {task.title}
        </button>
      )}

      {task.overdue && (
        <Badge variant="destructive" className="shrink-0">
          {t("tasks.list.overdue")}
        </Badge>
      )}

      <DueDateField value={task.dueAt ? new Date(task.dueAt) : null} onChange={onDueAtChange} disabled={!canUpdate} />
      <AssigneeField value={task.assigneeId} onChange={onAssigneeChange} members={members} disabled={!canUpdate} />

      {canDelete && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onDelete}
          aria-label={t("tasks.list.delete")}
          className="h-6 w-6 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </li>
  );
}
