import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../lib/cn";
import { Button } from "./button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";

// Не shadcn Pagination (numbered links 1,2,3…): наш backend — keyset/cursor-пагинация по id
// (без COUNT(*)), поэтому общее число страниц принципиально неизвестно. Prev/Next + page-size —
// весь набор состояния, который у нас есть возможность честно показать.
export function Pagination({
  page,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  pageSize,
  pageSizeOptions = [10, 25, 50, 100],
  onPageSizeChange,
  pageLabel,
  pageSizeLabel,
  prevLabel,
  nextLabel,
  className,
}: {
  page: number;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  pageSize: number;
  pageSizeOptions?: number[];
  onPageSizeChange: (size: number) => void;
  pageLabel: (page: number) => ReactNode;
  pageSizeLabel: ReactNode;
  prevLabel: string;
  nextLabel: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>{pageSizeLabel}</span>
        <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value))}>
          <SelectTrigger className="h-8 w-[72px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizeOptions.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">{pageLabel(page)}</span>
        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="icon" className="h-8 w-8" disabled={!hasPrev} onClick={onPrev} aria-label={prevLabel}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="icon" className="h-8 w-8" disabled={!hasNext} onClick={onNext} aria-label={nextLabel}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
