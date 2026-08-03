import { useMemo, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Building2, Inbox } from "lucide-react";
import type { CompanyResponse, PhaseType } from "@helix/api-schemas";
import {
  Avatar,
  avatarVariants,
  Badge,
  cn,
  SortableTableHead,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@helix/ui";
import { useLocaleStore, useT } from "../../shared/i18n";
import { useLocalize } from "../../shared/lib/localize";
import { ContactsAvatarPopover } from "./contacts-popover";
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

interface TableRowModel extends ProjectCardViewModel {
  phaseName: string;
  phaseType: PhaseType;
}

function sortRows(rows: TableRowModel[], sort: SortState): TableRowModel[] {
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
export function TableView({
  orgId,
  workspaceId,
  companies,
}: {
  orgId: string;
  workspaceId: string;
  companies: CompanyResponse[];
}) {
  const board = useSuspenseQuery({ ...boardQueryOptions(orgId, workspaceId), select: toBoardViewModel }).data;
  const locale = useLocaleStore((state) => state.locale);
  const t = useT();
  const localize = useLocalize();
  const [sort, setSort] = useState<SortState>({ key: "createdAt", direction: "desc" });
  const companyNameById = useMemo(() => new Map(companies.map((c) => [c.id, c.name])), [companies]);

  const rows = useMemo(() => {
    const flat: TableRowModel[] = board.columns.flatMap((column) =>
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
      {/* containerClassName: доска скроллится ВНУТРИ уже ограниченной по высоте панели (не со
          страницей целиком, как Companies/Contacts) — sticky-шапка держится в этом же контейнере. */}
      <Table containerClassName="min-h-0 flex-1" className="min-w-[720px]">
        <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
          <TableRow header>
            <SortableTableHead active={sort.key === "title"} direction={sort.direction} onClick={() => toggleSort("title")}>
              {t("board.table.column.title")}
            </SortableTableHead>
            <SortableTableHead active={sort.key === "phase"} direction={sort.direction} onClick={() => toggleSort("phase")}>
              {t("board.table.column.phase")}
            </SortableTableHead>
            <SortableTableHead active={sort.key === "amount"} direction={sort.direction} onClick={() => toggleSort("amount")} align="right">
              {t("board.table.column.amount")}
            </SortableTableHead>
            <TableHead>{t("board.table.column.tasks")}</TableHead>
            <TableHead>{t("board.table.column.company")}</TableHead>
            <TableHead>{t("board.table.column.contacts")}</TableHead>
            <TableHead>{t("board.table.column.assignees")}</TableHead>
            <SortableTableHead active={sort.key === "createdAt"} direction={sort.direction} onClick={() => toggleSort("createdAt")}>
              {t("board.table.column.createdAt")}
            </SortableTableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((project) => (
            <TableRow key={project.id}>
              <TableCell className="max-w-[280px]">
                <Link
                  to="/projects/$projectId/contacts"
                  params={{ projectId: project.id }}
                  className="block truncate font-medium text-foreground hover:text-accent"
                >
                  {project.title}
                </Link>
                {project.source && <span className="text-xs text-muted-foreground">{project.source}</span>}
              </TableCell>
              <TableCell>
                <Badge variant={phaseTypeBadgeVariant(project.phaseType)}>{project.phaseName}</Badge>
              </TableCell>
              <TableCell className="whitespace-nowrap text-right tabular-nums">
                {project.amount ? formatAmount(project.amount, locale) : "—"}
              </TableCell>
              <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                {project.totalTasksCount > 0 ? `${project.doneTasksCount}/${project.totalTasksCount}` : "—"}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {project.companyId ? (
                  <span className="inline-flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5" />
                    {companyNameById.get(project.companyId) ?? "—"}
                  </span>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell>
                {project.contacts.length > 0 ? (
                  <ContactsAvatarPopover contacts={project.contacts} />
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
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
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {dateFormatter.format(new Date(project.createdAt))}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {truncatedPhases.length > 0 && (
        <p className="shrink-0 text-xs text-muted-foreground">{t("board.table.truncated")}</p>
      )}
    </div>
  );
}
