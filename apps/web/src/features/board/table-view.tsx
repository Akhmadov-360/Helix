import { useMemo, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, ArrowUpDown, Inbox } from "lucide-react";
import type { PhaseType } from "@helix/api-schemas";
import { Avatar, avatarVariants, Badge, cn } from "@helix/ui";
import { useLocaleStore, useT } from "../../shared/i18n";
import { useLocalize } from "../../shared/lib/localize";
import { formatAmount, phaseTypeBadgeVariant } from "./format";
import { boardQueryOptions } from "./queries";
import { toBoardViewModel, type ProjectCardViewModel } from "./select";

// Столько же аватаров, сколько на карточке доски (project-card.tsx) — единая визуальная граница
// "стек vs +N" в обоих представлениях.
const MAX_VISIBLE_ASSIGNEES = 3;

type SortKey = "title" | "phase" | "amount" | "createdAt";
type SortDirection = "asc" | "desc";
interface SortState {
  key: SortKey;
  direction: SortDirection;
}

interface TableRow extends ProjectCardViewModel {
  phaseName: string;
  phaseType: PhaseType;
}

function sortRows(rows: TableRow[], sort: SortState): TableRow[] {
  const dir = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    switch (sort.key) {
      case "title":
        return a.title.localeCompare(b.title) * dir;
      case "phase":
        return a.phaseName.localeCompare(b.phaseName) * dir;
      case "amount":
        return ((a.amount?.value ?? -Infinity) - (b.amount?.value ?? -Infinity)) * dir;
      case "createdAt":
        return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir;
      default:
        return 0;
    }
  });
}

// Табличная альтернатива канбану (FR-PRJ-7): та же board-кэш-запись, что у BoardView (общий
// query key — переключение Доска/Таблица без лишнего запроса и without loading-flash), но плоский
// список всех фаз сразу — удобно сканировать/сортировать много лидов, не листая колонки.
export function TableView({ orgId, workspaceId }: { orgId: string; workspaceId: string }) {
  const board = useSuspenseQuery({ ...boardQueryOptions(orgId, workspaceId), select: toBoardViewModel }).data;
  const locale = useLocaleStore((state) => state.locale);
  const t = useT();
  const localize = useLocalize();
  const [sort, setSort] = useState<SortState>({ key: "createdAt", direction: "desc" });

  const rows = useMemo(() => {
    const flat: TableRow[] = board.columns.flatMap((column) =>
      column.projects.map((project) => ({
        ...project,
        phaseName: localize(column.phaseName),
        phaseType: column.type,
      })),
    );
    return sortRows(flat, sort);
  }, [board, sort, localize]);

  const truncatedPhases = board.columns.filter((column) => column.hasMore);
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric" }), [locale]);

  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: key === "createdAt" || key === "amount" ? "desc" : "asc" },
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <Inbox className="h-8 w-8" />
        <p>{t("board.table.empty")}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {/* overflow-x-auto: узкие экраны не ломают layout (ux: Table Handling) — таблица скроллится
          горизонтально внутри своего контейнера, а не выталкивает страницу. */}
      <div className="scroll-slim min-h-0 flex-1 overflow-auto rounded-lg border border-border">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <SortableHeader label={t("board.table.column.title")} sortKey="title" sort={sort} onSort={toggleSort} />
              <SortableHeader label={t("board.table.column.phase")} sortKey="phase" sort={sort} onSort={toggleSort} />
              <SortableHeader label={t("board.table.column.amount")} sortKey="amount" sort={sort} onSort={toggleSort} align="right" />
              <th scope="col" className="px-3 py-2 font-medium">
                {t("board.table.column.tasks")}
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                {t("board.table.column.assignees")}
              </th>
              <SortableHeader label={t("board.table.column.createdAt")} sortKey="createdAt" sort={sort} onSort={toggleSort} />
            </tr>
          </thead>
          <tbody>
            {rows.map((project) => (
              <tr key={project.id} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
                <td className="max-w-[280px] px-3 py-2">
                  <Link
                    to="/projects/$projectId/contacts"
                    params={{ projectId: project.id }}
                    className="block truncate font-medium text-foreground hover:text-accent"
                  >
                    {project.title}
                  </Link>
                  {project.source && <span className="text-xs text-muted-foreground">{project.source}</span>}
                </td>
                <td className="px-3 py-2">
                  <Badge variant={phaseTypeBadgeVariant(project.phaseType)}>{project.phaseName}</Badge>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                  {project.amount ? formatAmount(project.amount, locale) : "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted-foreground">
                  {project.totalTasksCount > 0 ? `${project.doneTasksCount}/${project.totalTasksCount}` : "—"}
                </td>
                <td className="px-3 py-2">
                  {project.assignees.length > 0 ? (
                    <div className="flex -space-x-2">
                      {project.assignees.slice(0, MAX_VISIBLE_ASSIGNEES).map((assignee) => (
                        <Avatar key={assignee.userId} name={assignee.name} size="sm" className="ring-2 ring-card" />
                      ))}
                      {project.assignees.length > MAX_VISIBLE_ASSIGNEES && (
                        <span className={cn(avatarVariants({ size: "sm" }), "ring-2 ring-card")}>
                          +{project.assignees.length - MAX_VISIBLE_ASSIGNEES}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                  {dateFormatter.format(new Date(project.createdAt))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {truncatedPhases.length > 0 && (
        <p className="shrink-0 text-xs text-muted-foreground">{t("board.table.truncated")}</p>
      )}
    </div>
  );
}

function SortableHeader({
  label,
  sortKey,
  sort,
  onSort,
  align,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
  align?: "right";
}) {
  const active = sort.key === sortKey;
  // aria-sort на <th> — стандартный способ озвучить текущую сортировку скринридеру (ux: sortable-table).
  const ariaSort = active ? (sort.direction === "asc" ? "ascending" : "descending") : "none";
  const Icon = active ? (sort.direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;

  return (
    <th scope="col" aria-sort={ariaSort} className="px-3 py-2 font-medium">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 transition-colors hover:text-foreground",
          align === "right" && "flex-row-reverse",
        )}
      >
        {label}
        <Icon className={cn("h-3 w-3", !active && "opacity-40")} />
      </button>
    </th>
  );
}
