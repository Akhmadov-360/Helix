import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { cn } from "../lib/cn";
import { Pagination } from "./pagination";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableToolbar } from "./table";

// Композиция поверх низкоуровневого <Table>: тулбар (title + search + actions) в шапке карточки,
// sticky <thead> при скролле, client-side пагинация, per-row action-слот, empty state. Заведён
// потому, что три+ страницы (Members, Contacts, Companies) повторяли одну и ту же разметку с
// расхождениями (row-height, где-то был поиск, где-то нет) — примитив унифицирует и убирает
// копипасту.
//
// V1 намеренно ограничен: search + rowActions + client-pagination + emptyState. Sort/filter chips/
// Fields menu добавляются когда появится второй потребитель, которому это реально нужно (правило
// "3+ потребителя → фича примитива", CLAUDE.md).

export interface DataTableColumn<T> {
  /** Стабильный идентификатор (react key + опция для columns-menu в будущем). */
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Tailwind-класс на <th> (ширина/выравнивание — напр. "w-32 text-right"). */
  className?: string;
  /** Тот же класс на <td>. По дефолту наследует от `className`. */
  cellClassName?: string;
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
  pageSizeLabel: ReactNode;
  pageLabel: (page: number, total: number) => ReactNode;
  prevLabel: string;
  nextLabel: string;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: readonly T[];
  getRowKey: (row: T) => string;

  // Toolbar slots (все опциональны — если ничего нет, toolbar не рендерится)
  title?: ReactNode;
  actions?: ReactNode;
  search?: DataTableSearchProps<T>;

  // Row-level
  rowActions?: (row: T) => ReactNode;
  onRowClick?: (row: T) => void;

  // States / layout
  emptyState?: ReactNode;
  rowHeight?: DataTableRowHeight;
  /** Липкий <thead> при скролле контейнера. По умолчанию on. */
  stickyHeader?: boolean;
  /** Client-side пагинация. Undefined = без пагинации (показываем всё). Требует labels. */
  pagination?: {
    initialPageSize: number;
    pageSizeOptions?: number[];
    labels: DataTablePaginationLabels;
  };
  /** Aria-label на <table> — важно для скринридеров, всегда указывать. */
  ariaLabel: string;
  /** Внешний контейнер (напр. min-h-0 flex-1 для скролла в высоком лэйауте). */
  containerClassName?: string;
  className?: string;
}

export function DataTable<T>({
  columns,
  data,
  getRowKey,
  title,
  actions,
  search,
  rowActions,
  onRowClick,
  emptyState,
  rowHeight = "comfortable",
  stickyHeader = true,
  pagination,
  ariaLabel,
  containerClassName,
  className,
}: DataTableProps<T>) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(pagination?.initialPageSize ?? 0);

  const filtered = useMemo(() => {
    if (!search || !search.value.trim()) return data;
    const q = search.value.trim();
    return data.filter((row) => search.matches(row, q));
  }, [data, search]);

  const totalPages = pageSize > 0 ? Math.max(1, Math.ceil(filtered.length / pageSize)) : 1;
  // Клэмп: удаление/фильтр может сделать текущую страницу пустой — откатываемся в допустимый
  // диапазон вместо render'а пустого экрана.
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

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <Table
        toolbar={toolbar}
        containerClassName={containerClassName}
        aria-label={ariaLabel}
        className="w-full"
      >
        {showEmpty ? (
          <TableBody>
            <TableRow>
              <TableCell colSpan={columns.length + (rowActions ? 1 : 0)}>{emptyState}</TableCell>
            </TableRow>
          </TableBody>
        ) : (
          <>
            <TableHeader className={cn(stickyHeader && "sticky top-0 z-10")}>
              <TableRow header>
                {columns.map((c) => (
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
                  className={cn(ROW_HEIGHT_CLASS[rowHeight], onRowClick && "cursor-pointer")}
                >
                  {columns.map((c) => (
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

      {pagination && pageSize > 0 && filtered.length > pageSize && (
        <Pagination
          page={currentPage}
          hasPrev={currentPage > 1}
          hasNext={currentPage < totalPages}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
          pageSize={pageSize}
          pageSizeOptions={pagination.pageSizeOptions}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          pageLabel={(p) => pagination.labels.pageLabel(p, totalPages)}
          pageSizeLabel={pagination.labels.pageSizeLabel}
          prevLabel={pagination.labels.prevLabel}
          nextLabel={pagination.labels.nextLabel}
        />
      )}
    </div>
  );
}
