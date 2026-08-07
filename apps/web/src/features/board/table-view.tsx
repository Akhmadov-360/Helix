import { useMemo, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Building2, Inbox } from "lucide-react";
import type { CompanyResponse, PhaseType } from "@helix/api-schemas";
import {
  Avatar,
  avatarVariants,
  Badge,
  cn,
  ColumnsMenu,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SortableTableHead,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
} from "@helix/ui";
import { useLocaleStore, useT } from "../../shared/i18n";
import { useColumnVisibility } from "../../shared/lib/use-column-visibility";
import { useLocalize } from "../../shared/lib/localize";
import { useTableSort, type TableSort } from "../../shared/lib/use-table-sort";
import { ContactsAvatarPopover } from "./contacts-popover";
import { formatAmount, phaseTypeBadgeVariant } from "./format";
import { boardQueryOptions } from "./queries";
import { toBoardViewModel, type ProjectCardViewModel } from "./select";

// Столько же аватаров, сколько на карточке доски (project-card.tsx) — единая визуальная граница
// "стек vs +N" в обоих представлениях.
const MAX_VISIBLE_ASSIGNEES = 3;

type SortKey = "title" | "phase" | "amount" | "createdAt";

interface TableRowModel extends ProjectCardViewModel {
  phaseName: string;
  phaseType: PhaseType;
}

function sortRows(rows: TableRowModel[], sort: TableSort<SortKey>): TableRowModel[] {
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
  const [sort, toggleSort] = useTableSort<SortKey>({ key: "createdAt", direction: "desc" }, (key) =>
    key === "createdAt" || key === "amount" ? "desc" : "asc",
  );
  const companyNameById = useMemo(() => new Map(companies.map((c) => [c.id, c.name])), [companies]);

  const allRows = useMemo(
    () =>
      board.columns.flatMap((column) =>
        column.projects.map((project): TableRowModel => ({
          ...project,
          phaseName: localize(column.phaseName),
          phaseType: column.type,
        })),
      ),
    [board, localize],
  );

  // Клиентские фильтры (не запрос к бэку — вся доска уже загружена целиком в этом представлении,
  // FR-PRJ-7): фаза/участник/сумма сужают уже имеющийся в памяти список.
  const [phaseFilter, setPhaseFilter] = useState<string | undefined>(undefined);
  const [assigneeFilter, setAssigneeFilter] = useState<string | undefined>(undefined);
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");

  const phaseOptions = useMemo(() => [...new Set(allRows.map((r) => r.phaseName))], [allRows]);
  const assigneeOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const row of allRows) for (const assignee of row.assignees) byId.set(assignee.userId, assignee.name);
    return [...byId.entries()].map(([userId, name]) => ({ userId, name }));
  }, [allRows]);

  const rows = useMemo(() => {
    const min = amountMin ? Number(amountMin) : undefined;
    const max = amountMax ? Number(amountMax) : undefined;
    const filtered = allRows.filter((row) => {
      if (phaseFilter && row.phaseName !== phaseFilter) return false;
      if (assigneeFilter && !row.assignees.some((a) => a.userId === assigneeFilter)) return false;
      if (min !== undefined && (row.amount?.value ?? -Infinity) < min) return false;
      if (max !== undefined && (row.amount?.value ?? Infinity) > max) return false;
      return true;
    });
    return sortRows(filtered, sort);
  }, [allRows, sort, phaseFilter, assigneeFilter, amountMin, amountMax]);

  const truncatedPhases = board.columns.filter((column) => column.hasMore);
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric" }), [locale]);

  // Title — всегда виден (первичный идентификатор строки), остальное прячется через "Columns".
  const columns = [
    { key: "phase", label: t("board.table.column.phase") },
    { key: "amount", label: t("board.table.column.amount") },
    { key: "tasks", label: t("board.table.column.tasks") },
    { key: "company", label: t("board.table.column.company") },
    { key: "contacts", label: t("board.table.column.contacts") },
    { key: "assignees", label: t("board.table.column.assignees") },
    { key: "createdAt", label: t("board.table.column.createdAt") },
  ];
  const { isVisible, toggle: toggleColumn } = useColumnVisibility("board");
  const columnCount = 1 + columns.filter((c) => isVisible(c.key)).length;

  if (allRows.length === 0) {
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
      <Table
        toolbar={
          <TableToolbar
            filters={
              <>
                {phaseOptions.length > 1 && (
                  <Select value={phaseFilter ?? "all"} onValueChange={(value) => setPhaseFilter(value === "all" ? undefined : value)}>
                    <SelectTrigger className="h-9 w-[150px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("board.table.filter.allPhases")}</SelectItem>
                      {phaseOptions.map((phase) => (
                        <SelectItem key={phase} value={phase}>
                          {phase}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {assigneeOptions.length > 0 && (
                  <Select value={assigneeFilter ?? "all"} onValueChange={(value) => setAssigneeFilter(value === "all" ? undefined : value)}>
                    <SelectTrigger className="h-9 w-[160px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("board.table.filter.allAssignees")}</SelectItem>
                      {assigneeOptions.map((assignee) => (
                        <SelectItem key={assignee.userId} value={assignee.userId}>
                          {assignee.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Input
                  type="number"
                  inputMode="numeric"
                  value={amountMin}
                  onChange={(e) => setAmountMin(e.target.value)}
                  placeholder={t("board.table.filter.amountMin")}
                  className="h-9 w-[110px]"
                />
                <Input
                  type="number"
                  inputMode="numeric"
                  value={amountMax}
                  onChange={(e) => setAmountMax(e.target.value)}
                  placeholder={t("board.table.filter.amountMax")}
                  className="h-9 w-[110px]"
                />
              </>
            }
            actions={<ColumnsMenu columns={columns} isVisible={isVisible} onToggle={toggleColumn} triggerLabel={t("table.columns.trigger")} />}
          />
        }
        containerClassName="min-h-0 flex-1"
        className="min-w-[720px]"
      >
        <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
          <TableRow header>
            <SortableTableHead active={sort.key === "title"} direction={sort.direction} onClick={() => toggleSort("title")}>
              {t("board.table.column.title")}
            </SortableTableHead>
            {isVisible("phase") && (
              <SortableTableHead active={sort.key === "phase"} direction={sort.direction} onClick={() => toggleSort("phase")}>
                {t("board.table.column.phase")}
              </SortableTableHead>
            )}
            {isVisible("amount") && (
              <SortableTableHead active={sort.key === "amount"} direction={sort.direction} onClick={() => toggleSort("amount")} align="right">
                {t("board.table.column.amount")}
              </SortableTableHead>
            )}
            {isVisible("tasks") && <TableHead>{t("board.table.column.tasks")}</TableHead>}
            {isVisible("company") && <TableHead>{t("board.table.column.company")}</TableHead>}
            {isVisible("contacts") && <TableHead>{t("board.table.column.contacts")}</TableHead>}
            {isVisible("assignees") && <TableHead>{t("board.table.column.assignees")}</TableHead>}
            {isVisible("createdAt") && (
              <SortableTableHead active={sort.key === "createdAt"} direction={sort.direction} onClick={() => toggleSort("createdAt")}>
                {t("board.table.column.createdAt")}
              </SortableTableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columnCount}>
                <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
                  <Inbox className="h-8 w-8" />
                  <p>{t("board.table.noResults")}</p>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            rows.map((project) => (
            <TableRow key={project.id}>
              <TableCell className="max-w-[280px]">
                <Link
                  to="/projects/$projectId/contacts"
                  params={{ projectId: project.id }}
                  className="group flex items-center gap-1 font-medium text-foreground hover:text-accent"
                >
                  <span className="truncate">{project.title}</span>
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-accent" />
                </Link>
                {project.source && <span className="text-xs text-muted-foreground">{project.source}</span>}
              </TableCell>
              {isVisible("phase") && (
                <TableCell>
                  <Badge variant={phaseTypeBadgeVariant(project.phaseType)}>{project.phaseName}</Badge>
                </TableCell>
              )}
              {isVisible("amount") && (
                <TableCell className="whitespace-nowrap text-right tabular-nums">
                  {project.amount ? formatAmount(project.amount, locale) : "—"}
                </TableCell>
              )}
              {isVisible("tasks") && (
                <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                  {project.totalTasksCount > 0 ? `${project.doneTasksCount}/${project.totalTasksCount}` : "—"}
                </TableCell>
              )}
              {isVisible("company") && (
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
              )}
              {isVisible("contacts") && (
                <TableCell>
                  {project.contacts.length > 0 ? (
                    <ContactsAvatarPopover contacts={project.contacts} />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              )}
              {isVisible("assignees") && (
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
              )}
              {isVisible("createdAt") && (
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {dateFormatter.format(new Date(project.createdAt))}
                </TableCell>
              )}
            </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      {truncatedPhases.length > 0 && (
        <p className="shrink-0 text-xs text-muted-foreground">{t("board.table.truncated")}</p>
      )}
    </div>
  );
}
