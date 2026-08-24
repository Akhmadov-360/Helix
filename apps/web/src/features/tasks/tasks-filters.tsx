import { useState } from "react";
import { CalendarRange, ListFilter, UserRound, X } from "lucide-react";
import type { TaskPriority } from "@helix/api-schemas";
import {
  Avatar,
  Button,
  Calendar,
  CountBadge,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  cn,
} from "@helix/ui";
import { useLocaleStore, useT } from "../../shared/i18n";
import {
  UNASSIGNED_KEY,
  type StatusFilter,
  type TasksFilterState,
} from "./tasks-filter-state";

const PRIORITIES: readonly TaskPriority[] = ["URGENT", "HIGH", "MEDIUM", "LOW", "NONE"] as const;
const STATUS_OPTIONS: readonly StatusFilter[] = ["all", "open", "done"] as const;

export function TasksFilterChips({
  state,
  onChange,
  members,
}: {
  state: TasksFilterState;
  onChange: (next: TasksFilterState) => void;
  members: { userId: string; name: string }[];
}) {
  return (
    <>
      <StatusToggle value={state.status} onChange={(status) => onChange({ ...state, status })} />
      <AssigneeChip
        members={members}
        selected={state.assignees}
        onToggle={(key) => {
          const next = new Set(state.assignees);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          onChange({ ...state, assignees: next });
        }}
        onClear={() => onChange({ ...state, assignees: new Set() })}
      />
      <PriorityChip
        selected={state.priorities}
        onToggle={(p) => {
          const next = new Set(state.priorities);
          if (next.has(p)) next.delete(p);
          else next.add(p);
          onChange({ ...state, priorities: next });
        }}
        onClear={() => onChange({ ...state, priorities: new Set() })}
      />
      <DueRangeChip
        from={state.dueFrom}
        to={state.dueTo}
        onChange={(from, to) => onChange({ ...state, dueFrom: from, dueTo: to })}
      />
    </>
  );
}

// Segmented control из 3 кнопок — компактнее dropdown'а под трёхстанное значение (all/open/done)
// и мгновенное переключение в один клик, без открытия меню.
function StatusToggle({ value, onChange }: { value: StatusFilter; onChange: (v: StatusFilter) => void }) {
  const t = useT();
  return (
    <div
      role="group"
      aria-label={t("tasks.filter.status")}
      className="inline-flex overflow-hidden rounded-md border border-border"
    >
      {STATUS_OPTIONS.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onChange(s)}
          className={cn(
            "px-2.5 py-1 text-xs font-medium transition-colors",
            value === s ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60",
          )}
        >
          {t(`tasks.filter.status.${s}`)}
        </button>
      ))}
    </div>
  );
}

function AssigneeChip({
  members,
  selected,
  onToggle,
  onClear,
}: {
  members: { userId: string; name: string }[];
  selected: Set<string>;
  onToggle: (key: string) => void;
  onClear: () => void;
}) {
  const t = useT();
  const active = selected.size > 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant={active ? "secondary" : "outline"} size="sm">
          <UserRound className="h-3.5 w-3.5" />
          {t("tasks.filter.assignee")}
          {active && <CountBadge value={selected.size} />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 max-h-72 overflow-y-auto">
        <DropdownMenuCheckboxItem
          checked={selected.has(UNASSIGNED_KEY)}
          onSelect={(e) => e.preventDefault()}
          onCheckedChange={() => onToggle(UNASSIGNED_KEY)}
        >
          <span className="text-muted-foreground">{t("tasks.filter.unassigned")}</span>
        </DropdownMenuCheckboxItem>
        {members.map((m) => (
          <DropdownMenuCheckboxItem
            key={m.userId}
            checked={selected.has(m.userId)}
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={() => onToggle(m.userId)}
          >
            <span className="inline-flex items-center gap-2">
              <Avatar name={m.name} size="sm" />
              {m.name}
            </span>
          </DropdownMenuCheckboxItem>
        ))}
        {active && (
          <div className="border-t border-border p-1 pt-2">
            <Button type="button" variant="ghost" size="sm" className="w-full justify-start" onClick={onClear}>
              {t("tasks.filter.clear")}
            </Button>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PriorityChip({
  selected,
  onToggle,
  onClear,
}: {
  selected: Set<TaskPriority>;
  onToggle: (p: TaskPriority) => void;
  onClear: () => void;
}) {
  const t = useT();
  const active = selected.size > 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant={active ? "secondary" : "outline"} size="sm">
          <ListFilter className="h-3.5 w-3.5" />
          {t("tasks.filter.priority")}
          {active && <CountBadge value={selected.size} />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {PRIORITIES.map((p) => (
          <DropdownMenuCheckboxItem
            key={p}
            checked={selected.has(p)}
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={() => onToggle(p)}
          >
            {t(`tasks.priority.${p}`)}
          </DropdownMenuCheckboxItem>
        ))}
        {active && (
          <div className="border-t border-border p-1 pt-2">
            <Button type="button" variant="ghost" size="sm" className="w-full justify-start" onClick={onClear}>
              {t("tasks.filter.clear")}
            </Button>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Диапазон по dueAt: Calendar-примитив в range-режиме (react-day-picker). Лейбл чипа показывает
// краткий формат from–to при активном фильтре, «Срок» когда пусто. Внутри popover — Calendar +
// Clear-кнопка.
function DueRangeChip({
  from,
  to,
  onChange,
}: {
  from: Date | null;
  to: Date | null;
  onChange: (from: Date | null, to: Date | null) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const locale = useLocaleStore((s) => s.locale);
  const active = from !== null || to !== null;

  const fmt = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short" });
  const label = active
    ? `${from ? fmt.format(from) : "…"} – ${to ? fmt.format(to) : "…"}`
    : t("tasks.filter.dueRange");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant={active ? "secondary" : "outline"} size="sm">
          <CalendarRange className="h-3.5 w-3.5" />
          {label}
          {active && (
            <span
              role="button"
              tabIndex={0}
              aria-label={t("tasks.filter.clear")}
              onClick={(e) => {
                e.stopPropagation();
                onChange(null, null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onChange(null, null);
                }
              }}
              className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-3">
        {/* range-mode react-day-picker: outer state — DateRange | undefined; переводим null↔undefined. */}
        <Calendar
          mode="range"
          selected={{ from: from ?? undefined, to: to ?? undefined }}
          onSelect={(range) => {
            onChange(range?.from ?? null, range?.to ?? null);
          }}
          numberOfMonths={1}
        />
      </PopoverContent>
    </Popover>
  );
}
