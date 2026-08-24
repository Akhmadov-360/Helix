import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { TaskPriority, TaskResponse } from "@helix/api-schemas";
import { Badge, Button, Checkbox, cn, Tooltip, TooltipContent, TooltipTrigger } from "@helix/ui";
import { useT } from "../../shared/i18n";
import { AssigneeField } from "./assignee-field";
import { DueDateField } from "./due-date-field";
import { PriorityField } from "./priority-field";

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
  onPriorityChange,
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
  onPriorityChange: (priority: TaskPriority) => void;
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
    <li className="group flex items-center gap-2.5 rounded-lg p-2 transition-colors hover:bg-muted/40">
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
          className="relative flex-1 truncate text-left text-sm disabled:cursor-default"
        >
          {/* Зачёркивание — не CSS line-through (снэп без анимации в большинстве браузеров), а
              собственная линия, растущая слева направо/сжимающаяся обратно при снятии галочки. */}
          <span className={cn("transition-colors duration-200", task.done && "text-muted-foreground")}>
            {task.title}
          </span>
          <AnimatePresence>
            {task.done && (
              <motion.span
                key="strike"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                exit={{ scaleX: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                style={{ originX: 0 }}
                className="pointer-events-none absolute left-0 top-1/2 h-px w-full bg-muted-foreground"
              />
            )}
          </AnimatePresence>
        </button>
      )}

      {task.overdue && (
        <Badge variant="destructive" className="shrink-0">
          {t("tasks.list.overdue")}
        </Badge>
      )}

      <DueDateField value={task.dueAt ? new Date(task.dueAt) : null} onChange={onDueAtChange} disabled={!canUpdate} />
      <PriorityField value={task.priority} onChange={onPriorityChange} disabled={!canUpdate} />
      <AssigneeField value={task.assigneeId} onChange={onAssigneeChange} members={members} disabled={!canUpdate} />

      {/* Edit/Delete кнопки теперь постоянно видны (не opacity-0 group-hover) — user-request:
          hover-only + touch-устройства = невозможно найти. Tooltip компенсирует отсутствие
          text-label в узкой иконке. Клик по title тоже открывает edit — оставляем как второй
          affordance, привычный пользователям Linear/Notion. */}
      {canUpdate && !editing && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setEditing(true)}
              aria-label={t("tasks.list.edit")}
              className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("tasks.list.edit")}</TooltipContent>
        </Tooltip>
      )}
      {canDelete && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onDelete}
              aria-label={t("tasks.list.delete")}
              className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("tasks.list.delete")}</TooltipContent>
        </Tooltip>
      )}
    </li>
  );
}
