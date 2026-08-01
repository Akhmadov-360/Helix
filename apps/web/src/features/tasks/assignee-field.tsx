import { Check, UserRound } from "lucide-react";
import { useState } from "react";
import { Avatar, Popover, PopoverContent, PopoverTrigger, cn } from "@helix/ui";
import { useT } from "../../shared/i18n";

// Один исполнитель на задачу (docs/specs/tasks.md §3, §6 — осознанное M1-решение, PRD FR-PRJ-4
// "assignee" в единственном числе): попап переключает assigneeId клик = назначить/снять, а не
// множественный выбор.
export function AssigneeField({
  value,
  onChange,
  members,
  disabled,
  compact = false,
  className,
}: {
  value: string | null;
  onChange: (userId: string | null) => void;
  members: { userId: string; name: string }[];
  disabled?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const assignee = value ? members.find((m) => m.userId === value) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={t("tasks.list.pickAssignee")}
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50",
            className,
          )}
        >
          {assignee ? (
            <Avatar name={assignee.name} size="sm" className="h-5 w-5 text-[10px]" />
          ) : (
            <UserRound className="h-3.5 w-3.5" />
          )}
          {assignee && !compact && <span className="text-xs text-foreground">{assignee.name}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1" align="end">
        <div className="flex max-h-56 flex-col overflow-y-auto">
          {members.map((member) => {
            const selected = member.userId === value;
            return (
              <button
                key={member.userId}
                type="button"
                onClick={() => {
                  onChange(selected ? null : member.userId);
                  setOpen(false);
                }}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted",
                  selected && "bg-muted",
                )}
              >
                <Avatar name={member.name} size="sm" />
                <span className="flex-1 truncate">{member.name}</span>
                {selected && <Check className="h-3.5 w-3.5 shrink-0" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
