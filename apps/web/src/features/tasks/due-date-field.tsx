import { CalendarIcon } from "lucide-react";
import { useState } from "react";
import { Button, Calendar, Popover, PopoverContent, PopoverTrigger, cn } from "@helix/ui";
import { useLocaleStore, useT } from "../../shared/i18n";

// Общий попап выбора срока — используется и в строке быстрого создания (иконка в инпуте), и в
// строке задачи (иконка/дата рядом с чекбоксом). Два потребителя внутри одной фичи — не выносим
// в packages/ui, композиция специфична для tasks (Calendar-примитив там уже есть).
export function DueDateField({
  value,
  onChange,
  disabled,
  compact = false,
  className,
}: {
  value: Date | null;
  onChange: (date: Date | null) => void;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const t = useT();
  const locale = useLocaleStore((state) => state.locale);
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={t("tasks.list.pickDate")}
          className={cn(
            "inline-flex items-center gap-1 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50",
            value && "text-foreground",
            className,
          )}
        >
          <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
          {value && !compact && (
            <span className="text-xs">{new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(value)}</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="end">
        <Calendar
          mode="single"
          selected={value ?? undefined}
          onSelect={(date) => {
            onChange(date ?? null);
            setOpen(false);
          }}
        />
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-1 w-full"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
          >
            {t("tasks.list.clearDate")}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
