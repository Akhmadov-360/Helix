import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";
import { cn } from "../lib/cn";
import { Input } from "./input";

// Третий потребитель (board TableView, CompaniesView, GlobalContactsView независимо отрастили
// одну и ту же разметку таблицы + SortableHeader) — вынос по правилу «второй-третий → примитив».
// rounded-xl + shadow-sm (не rounded-lg без тени, как было во всех трёх) — та же elevation-семантика,
// что у Card: таблица тоже поверхность, не плоский div с бордером.
//
// toolbar — TableToolbar рендерится ВНУТРИ этой же карточки (общий border/rounded/shadow), не
// отдельным блоком над ней: визуально единый узел "тулбар + таблица", не два несвязанных.
// border-b отделяет его от шапки колонок, живёт вне scroll-контейнера — не едет с телом таблицы.
//
// containerClassName — под board TableView: там таблица сама скроллится внутри уже ограниченной
// по высоте панели (min-h-0 flex-1) со sticky-шапкой, а не со страницей целиком, как у Companies/
// Contacts — двух разных контейнеров без этого хука не выразить одним компонентом. Теперь это
// пропс ВНЕШНЕГО flex-col контейнера (тулбар + скролл-зона), сам скролл — во внутреннем div.
export function Table({
  className,
  containerClassName,
  toolbar,
  children,
  ...props
}: HTMLAttributes<HTMLTableElement> & { containerClassName?: string; toolbar?: ReactNode }) {
  return (
    <div className={cn("flex flex-col overflow-hidden rounded-xl border border-border shadow-sm", containerClassName)}>
      {toolbar && <div className="shrink-0 border-b border-border p-3">{toolbar}</div>}
      <div className="scroll-slim min-h-0 flex-1 overflow-auto">
        <table className={cn("w-full border-collapse text-sm", className)} {...props}>
          {children}
        </table>
      </div>
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

// Единая шапка над таблицей (title/search/actions) — второй-третий потребитель (Contacts,
// Companies) собирали одну и ту же строку с нуля, каждый со своей разметкой. Слоты — пропы, не
// произвольные children: явный, узкий контракт, а не "клади что хочешь в div".
export function TableToolbar({
  title,
  search,
  filters,
  actions,
  className,
}: {
  title?: ReactNode;
  search?: { value: string; onChange: (value: string) => void; placeholder?: string };
  /** Доп. фильтры (Select и т.п.) рядом с поиском — третий потребитель (Companies/Contacts/board
   * TableView), выносим слотом, а не жёстко зашитым набором контролов. */
  filters?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3", className)}>
      <div className="flex flex-1 flex-wrap items-center gap-3">
        {title && <h1 className="text-lg font-semibold">{title}</h1>}
        {search && (
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search.value}
              onChange={(e) => search.onChange(e.target.value)}
              placeholder={search.placeholder}
              className="h-9 pl-8"
            />
          </div>
        )}
        {filters}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
