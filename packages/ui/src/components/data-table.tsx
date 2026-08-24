import { Rows3 } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { Button } from "./button";
import { cn } from "../lib/cn";
import { ColumnsMenu } from "./columns-menu";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./dropdown-menu";
import { NumberedPagination } from "./numbered-pagination";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableToolbar } from "./table";

// Композиция поверх низкоуровневого <Table>: тулбар (title + search + actions) в шапке карточки,
// ряд control-чипов (Fields visibility + Row height), sticky <thead>, client-side пагинация
// (постоянно видна если задана), per-row action-слот, empty state. Заведён потому, что три+
// страницы (Members, Contacts, Companies) повторяли одну и ту же разметку с расхождениями
// (row-height, где-то был поиск, где-то нет) — примитив унифицирует и убирает копипасту.
//
// Занимает полную высоту родителя (`min-h-0 flex-1` на внутреннем скролл-контейнере) — таблица
// становится «полотном на всю доступную область», как в референсе с торговой лентой; пагинация
// всегда прибита к низу. Родитель обязан быть `flex flex-col` с ограниченной высотой.

export interface DataTableColumn<T> {
  /** Стабильный идентификатор (react key + опция для columns-menu). */
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Tailwind-класс на <th> (ширина/выравнивание — напр. "w-32 text-right"). */
  className?: string;
  /** Тот же класс на <td>. По дефолту наследует от `className`. */
  cellClassName?: string;
  /** Можно ли скрыть колонку через Fields-меню. По умолчанию true. false = всегда видна. */
  hideable?: boolean;
  /** Локализованное имя для чекбокса в Fields-меню (fallback: `header`, если это строка). */
  menuLabel?: ReactNode;
}

export type DataTableRowHeight = "compact" | "comfortable" | "spacious";

const ROW_HEIGHT_CLASS: Record<DataTableRowHeight, string> = {
  compact: "h-10",
  comfortable: "h-14",
  spacious: "h-20",
};

export interface DataTableSearchProps<T> {
  value: string;
  onChange: (value: string) => void;
  /** Матчер — вызывается на каждой строке при непустом query, вернёт true = показать. */
  matches: (row: T, query: string) => boolean;
  placeholder?: string;
}

export interface DataTablePaginationLabels {
  /** "10 per page" / "10 на странице" — динамически подставляем размер. */
  perPageLabel: (size: number) => ReactNode;
  prevLabel: string;
  nextLabel: string;
  pageAriaLabel: (page: number) => string;
  /** aria-label на <nav>-обёртке пагинации, локализованный. */
  navAriaLabel: string;
}

export interface DataTableControlLabels {
  /** Триггер Fields-меню («Fields», «Колонки», «Ustunlar»). */
  fields: string;
  /** Триггер Row-height-меню («Row height», «Плотность»). */
  rowHeight: string;
  rowHeightCompact: string;
  rowHeightComfortable: string;
  rowHeightSpacious: string;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: readonly T[];
  getRowKey: (row: T) => string;

  // Toolbar slots
  title?: ReactNode;
  actions?: ReactNode;
  search?: DataTableSearchProps<T>;
  /** Слот для кастомных filter-чипов (Role, Assignee и т.п.) в chip-row до Fields/RowHeight. */
  filterChips?: ReactNode;
  /** Дополнительный предикат, применяется К каждой строке ПОСЛЕ search.matches. Если чип-фильтр
   *  меняет своё состояние — родитель обновляет это значение (обычно useCallback от filter-state). */
  filterMatches?: (row: T) => boolean;

  // Row-level
  /**
   * Рендерер per-row action-слота (обычно kebab-menu). Если используется вместе с `onRowClick`,
   * ВНУТРИ этого рендерера обязательно вызывать `e.stopPropagation()` на клике — иначе клик по
   * кнопке всплывёт до строки и триггернёт row-click. React не даёт разделить event-регионы
   * автоматически.
   */
  rowActions?: (row: T) => ReactNode;
  onRowClick?: (row: T) => void;
  /** Опциональный класс на <tr> — используется для подсветки конкретных строк (напр. dedup). */
  rowClassName?: (row: T) => string | undefined;

  // States / layout
  emptyState?: ReactNode;
  /** Дефолтная плотность рядов; если задан controlLabels, юзер может переключить в меню. */
  defaultRowHeight?: DataTableRowHeight;
  /** Липкий <thead> при скролле контейнера. По умолчанию on. */
  stickyHeader?: boolean;
  /** Client-side пагинация. Undefined = без пагинации. Задан = всегда виден footer, даже если 1 стр. */
  pagination?: {
    initialPageSize: number;
    pageSizeOptions?: number[];
    labels: DataTablePaginationLabels;
  };
  /** Локализация Fields/RowHeight-чипов. Без него — чипы не рендерятся (backward compat). */
  controlLabels?: DataTableControlLabels;
  /** Aria-label на <table> — важно для скринридеров, всегда указывать. */
  ariaLabel: string;
  className?: string;
}

export function DataTable<T>({
  columns,
  data,
  getRowKey,
  title,
  actions,
  search,
  filterChips,
  filterMatches,
  rowActions,
  onRowClick,
  rowClassName,
  emptyState,
  defaultRowHeight = "comfortable",
  stickyHeader = true,
  pagination,
  controlLabels,
  ariaLabel,
  className,
}: DataTableProps<T>) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(pagination?.initialPageSize ?? 0);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [rowHeight, setRowHeight] = useState<DataTableRowHeight>(defaultRowHeight);

  const visibleColumns = useMemo(
    () => columns.filter((c) => !hidden.has(c.key)),
    [columns, hidden],
  );

  const filtered = useMemo(() => {
    const q = search?.value.trim() ?? "";
    return data.filter((row) => {
      if (q && search && !search.matches(row, q)) return false;
      if (filterMatches && !filterMatches(row)) return false;
      return true;
    });
  }, [data, search, filterMatches]);

  const totalPages = pageSize > 0 ? Math.max(1, Math.ceil(filtered.length / pageSize)) : 1;
  const currentPage = Math.min(page, totalPages);
  const paginated = useMemo(() => {
    if (pageSize <= 0) return filtered;
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  const toolbar = useMemo(() => {
    if (title === undefined && actions === undefined && search === undefined) return undefined;
    return (
      <TableToolbar
        title={title}
        search={
          search
            ? { value: search.value, onChange: search.onChange, placeholder: search.placeholder }
            : undefined
        }
        actions={actions}
      />
    );
  }, [title, actions, search]);

  const showEmpty = filtered.length === 0 && emptyState !== undefined;

  // Chip-row: Fields + Row-height. Виден только если задан controlLabels и хотя бы одна фича
  // реально применима (есть hideable колонки для Fields; row-height всегда).
  const columnsMenuColumns = useMemo(
    () =>
      columns.map((c) => ({
        key: c.key,
        label: c.menuLabel ?? c.header,
        toggleable: c.hideable !== false,
      })),
    [columns],
  );
  const hasHideableColumns = columnsMenuColumns.some((c) => c.toggleable !== false);
  const showChipRow = controlLabels !== undefined || filterChips !== undefined;

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col gap-3", className)}>
      {showChipRow && (
        <div className="flex flex-wrap items-center gap-2">
          {filterChips}
          {controlLabels && hasHideableColumns && (
            <ColumnsMenu
              columns={columnsMenuColumns}
              isVisible={(key) => !hidden.has(key)}
              onToggle={(key) => {
                setHidden((prev) => {
                  const next = new Set(prev);
                  if (next.has(key)) next.delete(key);
                  else next.add(key);
                  return next;
                });
              }}
              triggerLabel={controlLabels.fields}
            />
          )}
          {controlLabels && (
            <RowHeightMenu value={rowHeight} onChange={setRowHeight} labels={controlLabels} />
          )}
        </div>
      )}

      <Table
        toolbar={toolbar}
        containerClassName="min-h-0 flex-1"
        aria-label={ariaLabel}
        className="w-full"
      >
        {showEmpty ? (
          <TableBody>
            <TableRow>
              <TableCell colSpan={visibleColumns.length + (rowActions ? 1 : 0)}>{emptyState}</TableCell>
            </TableRow>
          </TableBody>
        ) : (
          <>
            <TableHeader className={cn(stickyHeader && "sticky top-0 z-10")}>
              <TableRow header>
                {visibleColumns.map((c) => (
                  <TableHead key={c.key} className={c.className}>
                    {c.header}
                  </TableHead>
                ))}
                {rowActions && (
                  <TableHead className="w-10">
                    <span className="sr-only">•</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.map((row) => (
                <TableRow
                  key={getRowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    ROW_HEIGHT_CLASS[rowHeight],
                    onRowClick && "cursor-pointer",
                    rowClassName?.(row),
                  )}
                >
                  {visibleColumns.map((c) => (
                    <TableCell key={c.key} className={c.cellClassName ?? c.className}>
                      {c.cell(row)}
                    </TableCell>
                  ))}
                  {rowActions && <TableCell className="w-10">{rowActions(row)}</TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </>
        )}
      </Table>

      {pagination && pageSize > 0 && (
        <NumberedPagination
          page={currentPage}
          pageCount={totalPages}
          onPageChange={setPage}
          pageSize={pageSize}
          pageSizeOptions={pagination.pageSizeOptions}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          perPageLabel={pagination.labels.perPageLabel}
          prevLabel={pagination.labels.prevLabel}
          nextLabel={pagination.labels.nextLabel}
          pageAriaLabel={pagination.labels.pageAriaLabel}
          navAriaLabel={pagination.labels.navAriaLabel}
        />
      )}
    </div>
  );
}

function RowHeightMenu({
  value,
  onChange,
  labels,
}: {
  value: DataTableRowHeight;
  onChange: (v: DataTableRowHeight) => void;
  labels: DataTableControlLabels;
}) {
  const options: Array<{ key: DataTableRowHeight; label: string }> = [
    { key: "compact", label: labels.rowHeightCompact },
    { key: "comfortable", label: labels.rowHeightComfortable },
    { key: "spacious", label: labels.rowHeightSpacious },
  ];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Rows3 className="h-3.5 w-3.5" />
          {labels.rowHeight}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {options.map((o) => (
          <DropdownMenuItem
            key={o.key}
            onSelect={(e) => {
              e.preventDefault();
              onChange(o.key);
            }}
            className={value === o.key ? "font-medium" : undefined}
          >
            {o.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
