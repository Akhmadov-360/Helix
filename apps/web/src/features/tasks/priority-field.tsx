import { useState } from "react";
import { AlertCircle, ArrowUp, Check, Equal, Minus, Zap } from "lucide-react";
import type { TaskPriority } from "@helix/api-schemas";
import { Popover, PopoverContent, PopoverTrigger, cn } from "@helix/ui";
import { useT } from "../../shared/i18n";

// Plane-style полный enum порядок (URGENT сверху, NONE снизу), с иконкой + семантическим тоном.
// URGENT — молния (сигнал «горит»), HIGH — стрелка вверх, MEDIUM — «равно», LOW — минус, NONE —
// пустой круг. Тон совпадает с классами PriorityChip: одна визуальная семантика display+edit.
const PRIORITIES: readonly TaskPriority[] = ["URGENT", "HIGH", "MEDIUM", "LOW", "NONE"] as const;

const ICONS: Record<TaskPriority, typeof AlertCircle> = {
  URGENT: Zap,
  HIGH: ArrowUp,
  MEDIUM: Equal,
  LOW: Minus,
  NONE: AlertCircle,
};

// Иконки тонов — те же цвета, что чип, но БЕЗ фона (в popover-меню фон был бы шумом).
const ICON_TONES: Record<TaskPriority, string> = {
  URGENT: "text-destructive",
  HIGH: "text-amber-600 dark:text-amber-400",
  MEDIUM: "text-amber-500 dark:text-amber-300",
  LOW: "text-muted-foreground",
  NONE: "text-muted-foreground/60",
};

// Триггер-стиль повторяет AssigneeField/DueDateField (id-паттерн): маленькая иконка + опциональный
// label; compact-режим для inline-toolbar'а формы (quick-add), полный — для строки таска.
export function PriorityField({
  value,
  onChange,
  disabled,
  compact = false,
  className,
}: {
  value: TaskPriority;
  onChange: (priority: TaskPriority) => void;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const Icon = ICONS[value];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={t("tasks.list.pickPriority")}
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded p-1 transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50",
            ICON_TONES[value],
            className,
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          {value !== "NONE" && !compact && (
            <span className="text-xs">{t(`tasks.priority.${value}`)}</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-1" align="end">
        <div className="flex flex-col">
          {PRIORITIES.map((p) => {
            const PIcon = ICONS[p];
            const selected = p === value;
            return (
              <button
                key={p}
                type="button"
                onClick={() => {
                  onChange(p);
                  setOpen(false);
                }}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted",
                  selected && "bg-muted",
                )}
              >
                <PIcon className={cn("h-3.5 w-3.5 shrink-0", ICON_TONES[p])} />
                <span className="flex-1">{t(`tasks.priority.${p}`)}</span>
                {selected && <Check className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
