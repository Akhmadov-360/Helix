import type { ReactNode } from "react";
import { Columns3 } from "lucide-react";
import { Button } from "./button";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "./dropdown-menu";

export interface ColumnsMenuColumn {
  key: string;
  label: ReactNode;
  /** false — колонка всегда видна (например действия строки), в меню не появляется. По умолчанию true. */
  toggleable?: boolean;
}

// Columns-кнопка (design review — по образцу Attio): переключает видимость колонок таблицы,
// не убирает их из данных. checkbox, а не обычный Item — onSelect глушим, иначе Radix закрывает
// меню после первого же клика, а тут норма — включить/выключить несколько подряд, не переоткрывая.
export function ColumnsMenu({
  columns,
  isVisible,
  onToggle,
  triggerLabel,
}: {
  columns: ColumnsMenuColumn[];
  isVisible: (key: string) => boolean;
  onToggle: (key: string) => void;
  triggerLabel: string;
}) {
  const toggleable = columns.filter((column) => column.toggleable !== false);
  if (toggleable.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Columns3 className="h-3.5 w-3.5" />
          {triggerLabel}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {toggleable.map((column) => (
          <DropdownMenuCheckboxItem
            key={column.key}
            checked={isVisible(column.key)}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={() => onToggle(column.key)}
          >
            {column.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
