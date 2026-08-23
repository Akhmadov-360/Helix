import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./button";
import { cn } from "../lib/cn";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";

// Пагинация с нумерованными страницами (референс — Attio-подобные таблицы). Используется на
// client-side пагинации, где общее число страниц известно; для cursor-based (audit-log, keyset
// queries) остаётся <Pagination> с prev/next-only. Ellipsis сжимает длинные ряды: показываем
// первую страницу, окно вокруг текущей, последнюю; между — «…».

export interface NumberedPaginationProps {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  pageSize: number;
  pageSizeOptions?: number[];
  onPageSizeChange: (size: number) => void;
  /** Локализованные подписи. `perPageLabel(size)` — "10 per page" / "10 на странице". */
  perPageLabel: (size: number) => ReactNode;
  prevLabel: string;
  nextLabel: string;
  pageAriaLabel: (page: number) => string;
  className?: string;
}

export function NumberedPagination({
  page,
  pageCount,
  onPageChange,
  pageSize,
  pageSizeOptions = [10, 25, 50, 100],
  onPageSizeChange,
  perPageLabel,
  prevLabel,
  nextLabel,
  pageAriaLabel,
  className,
}: NumberedPaginationProps) {
  const items = paginationItems(page, pageCount);

  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3", className)}>
      <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value))}>
        <SelectTrigger className="h-9 w-fit gap-2 text-sm text-muted-foreground">
          <SelectValue>{perPageLabel(pageSize)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {pageSizeOptions.map((size) => (
            <SelectItem key={size} value={String(size)}>
              {perPageLabel(size)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <nav
        role="navigation"
        aria-label="Pagination"
        className="flex items-center gap-1"
      >
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label={prevLabel}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {items.map((item, i) =>
          item === "ellipsis" ? (
            <span key={`e${i}`} aria-hidden="true" className="px-2 text-sm text-muted-foreground">
              …
            </span>
          ) : (
            <Button
              key={item}
              type="button"
              variant={item === page ? "default" : "ghost"}
              size="sm"
              className={cn("h-9 min-w-9 px-3 text-sm tabular-nums", item === page && "cursor-default")}
              aria-current={item === page ? "page" : undefined}
              aria-label={pageAriaLabel(item)}
              onClick={() => item !== page && onPageChange(item)}
            >
              {item}
            </Button>
          ),
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-1 h-9 px-3"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
        >
          {nextLabel}
          <ChevronRight className="h-4 w-4" />
        </Button>
      </nav>
    </div>
  );
}

/**
 * Формируем набор кнопок: первая страница + окно ±1 вокруг текущей + последняя, с ellipsis
 * между разрывами. Дедуплицируем: current=1 → "1 2 3 … last" (без ведущего "1"-дубля).
 * Если pageCount ≤ 7 — показываем все страницы без ellipsis (визуально спокойнее).
 */
function paginationItems(page: number, pageCount: number): (number | "ellipsis")[] {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }
  const set = new Set<number>([1, pageCount, page, page - 1, page + 1]);
  const pages = [...set].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);
  const result: (number | "ellipsis")[] = [];
  for (let i = 0; i < pages.length; i++) {
    const cur = pages[i]!;
    if (i > 0 && cur - pages[i - 1]! > 1) result.push("ellipsis");
    result.push(cur);
  }
  return result;
}
