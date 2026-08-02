import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "../lib/cn";

// Третий потребитель (board TableView, CompaniesView, GlobalContactsView независимо отрастили
// одну и ту же разметку таблицы + SortableHeader) — вынос по правилу «второй-третий → примитив».
// rounded-xl + shadow-sm (не rounded-lg без тени, как было во всех трёх) — та же elevation-семантика,
// что у Card: таблица тоже поверхность, не плоский div с бордером.
//
// containerClassName — под board TableView: там таблица сама скроллится внутри уже ограниченной
// по высоте панели (min-h-0 flex-1) со sticky-шапкой, а не со страницей целиком, как у Companies/
// Contacts — двух разных контейнеров без этого хука не выразить одним компонентом.
export function Table({
  className,
  containerClassName,
  children,
  ...props
}: HTMLAttributes<HTMLTableElement> & { containerClassName?: string }) {
  return (
    <div className={cn("scroll-slim overflow-auto rounded-xl border border-border shadow-sm", containerClassName)}>
      <table className={cn("w-full border-collapse text-sm", className)} {...props}>
        {children}
      </table>
    </div>
  );
}

export function TableHeader({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("bg-muted/60", className)} {...props} />;
}

export function TableBody(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />;
}

export function TableRow({
  className,
  header = false,
  ...props
}: HTMLAttributes<HTMLTableRowElement> & { header?: boolean }) {
  return (
    <tr
      className={cn(
        header
          ? "border-b border-border text-left text-xs text-muted-foreground"
          : "border-b border-border/60 text-left last:border-0 hover:bg-muted/40",
        className,
      )}
      {...props}
    />
  );
}

export function TableHead({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th scope="col" className={cn("px-3 py-2 font-medium", className)} {...props} />;
}

export function TableCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-3 py-2", className)} {...props} />;
}

// aria-sort на <th> + фокусируемая <button> внутри (не голый кликабельный th) — WCAG sortable-table.
export function SortableTableHead({
  active,
  direction,
  onClick,
  align,
  className,
  children,
}: {
  active: boolean;
  direction: "asc" | "desc";
  onClick: () => void;
  align?: "right";
  className?: string;
  children: ReactNode;
}) {
  const ariaSort = active ? (direction === "asc" ? "ascending" : "descending") : "none";
  const Icon = active ? (direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;

  return (
    <th scope="col" aria-sort={ariaSort} className={cn("px-3 py-2 font-medium", className)}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1 transition-colors hover:text-foreground",
          align === "right" && "flex-row-reverse",
        )}
      >
        {children}
        <Icon className={cn("h-3 w-3", !active && "opacity-40")} />
      </button>
    </th>
  );
}
