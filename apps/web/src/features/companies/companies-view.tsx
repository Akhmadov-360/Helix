import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Briefcase, Building2, Link2Off, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import type { CompanyDedupHint as CompanyDedupHintData, CompanyResponse, ContactLink, DealLink } from "@helix/api-schemas";
import {
  Avatar,
  avatarVariants,
  Button,
  cn,
  ColumnsMenu,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Pagination,
  Popover,
  PopoverContent,
  PopoverTrigger,
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
import { useCan } from "../../shared/auth/ability";
import { useT } from "../../shared/i18n";
import { useColumnVisibility } from "../../shared/lib/use-column-visibility";
import { useCursorPagination } from "../../shared/lib/use-cursor-pagination";
import { useTableSort, type TableSort } from "../../shared/lib/use-table-sort";
import { CompanyDedupHint } from "./company-dedup-hint";
import { CompanyFormDialog } from "./company-form-dialog";
import { DeleteCompanyDialog } from "./delete-company-dialog";
import { useUnlinkCompanyFromProject } from "./mutations";
import { companiesListQueryOptions } from "./queries";

// Тот же порог, что project-card.tsx MAX_VISIBLE_ASSIGNEES — единая граница "стек vs +N" везде,
// где показываем аватарки-инициалы.
const MAX_VISIBLE_CONTACTS = 3;

type SortKey = "name" | "domain" | "industry";

function sortCompanies(companies: CompanyResponse[], sort: TableSort<SortKey>): CompanyResponse[] {
  const dir = sort.direction === "asc" ? 1 : -1;
  return [...companies].sort((a, b) => {
    const av = a[sort.key] ?? "";
    const bv = b[sort.key] ?? "";
    return av.localeCompare(bv) * dir;
  });
}

// Design review: не badge/чип в строке — единый Popover-триггер (счётчик), открывающий
// скроллящийся список сделок со ссылкой + КРАСНОЙ иконкой отвязки у каждой (не hover-only —
// явный, всегда видимый destructive-сигнал, раз это уже отдельное развёрнутое представление,
// не плотная строка таблицы).
function DealsPopover({
  projects,
  canUnlink,
  onUnlink,
  pending,
}: {
  projects: DealLink[];
  canUnlink: boolean;
  onUnlink: (projectId: string) => void;
  pending: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);

  if (projects.length === 0) return <span className="text-muted-foreground">—</span>;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md border border-border/50 bg-accent/50 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
        >
          <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
          {t("companies.list.dealsTrigger", { count: projects.length })}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex max-h-64 w-64 flex-col gap-0.5 overflow-y-auto p-2">
        {projects.map((project) => (
          <div key={project.id} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
            <Link
              to="/projects/$projectId/contacts"
              params={{ projectId: project.id }}
              className="flex min-w-0 items-center gap-2 truncate hover:text-accent"
            >
              <Briefcase className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{project.title}</span>
            </Link>
            {canUnlink && (
              <button
                type="button"
                onClick={() => onUnlink(project.id)}
                disabled={pending}
                aria-label={t("companies.list.unlinkDeal")}
                className="shrink-0 rounded p-1 text-destructive transition-colors hover:bg-destructive/10"
              >
                <Link2Off className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}

// Тот же avatar-стек, что project-card.tsx (доска) — сам стек и есть Popover-триггер, клик
// открывает полный список имён (design review, п. Contacts column).
function ContactsPopover({ contacts }: { contacts: ContactLink[] }) {
  const [open, setOpen] = useState(false);

  if (contacts.length === 0) return <span className="text-muted-foreground">—</span>;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="flex -space-x-2">
          {contacts.slice(0, MAX_VISIBLE_CONTACTS).map((contact) => (
            <Avatar key={contact.id} name={contact.name} size="sm" className="ring-2 ring-card" />
          ))}
          {contacts.length > MAX_VISIBLE_CONTACTS && (
            <span className={cn(avatarVariants({ size: "sm" }), "ring-2 ring-card")}>
              +{contacts.length - MAX_VISIBLE_CONTACTS}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex max-h-64 w-56 flex-col gap-0.5 overflow-y-auto p-2">
        {contacts.map((contact) => (
          <Link
            key={contact.id}
            to="/contacts/$contactId"
            params={{ contactId: contact.id }}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted hover:text-accent"
          >
            <Avatar name={contact.name} size="sm" />
            <span className="truncate">{contact.name}</span>
          </Link>
        ))}
      </PopoverContent>
    </Popover>
  );
}

export function CompaniesView({ orgId }: { orgId: string }) {
  const t = useT();
  const canCreate = useCan("Company.create");
  const canUpdate = useCan("Company.update");
  const canDelete = useCan("Company.delete");
  const canUnlinkDeal = useCan("Project.update");
  const unlinkFromProject = useUnlinkCompanyFromProject(orgId);

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const [industryFilter, setIndustryFilter] = useState<string | undefined>(undefined);
  const [pageSize, setPageSize] = useState(25);
  const pagination = useCursorPagination(`${debounced}|${industryFilter}|${pageSize}`);
  const query = useMemo(
    () => ({ q: debounced || undefined, industry: industryFilter, cursorId: pagination.cursorId, limit: pageSize }),
    [debounced, industryFilter, pagination.cursorId, pageSize],
  );

  // useQuery + placeholderData (не useSuspenseQuery) — тот же приём, что contacts/global-contacts-
  // view.tsx: смена поиска меняет query-key, старая страница остаётся на экране, пока грузится новая.
  const { data, isFetching } = useQuery({ ...companiesListQueryOptions(orgId, query), placeholderData: keepPreviousData });
  const companies = useMemo(() => data?.companies ?? [], [data]);
  const hasMore = data?.hasMore ?? false;

  // Список значений для дропдауна "Индустрия" — нет отдельного /distinct-эндпоинта, поэтому
  // берём отдельным (не завязанным на текущий поиск/фильтр/страницу) запросом первых 100 компаний
  // орги: список опций не должен схлопываться до одного значения, когда сам фильтр уже применён.
  const { data: industryOptionsData } = useQuery(companiesListQueryOptions(orgId, { limit: 100 }));
  const industryOptions = useMemo(
    () => [...new Set((industryOptionsData?.companies ?? []).map((c) => c.industry).filter((v): v is string => !!v))].sort(),
    [industryOptionsData],
  );

  const [sort, toggleSort] = useTableSort<SortKey>({ key: "name", direction: "asc" });
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CompanyResponse | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CompanyResponse | null>(null);
  const [dedup, setDedup] = useState<{ hint: CompanyDedupHintData; newCompanyId: string } | null>(null);

  const rows = useMemo(() => sortCompanies(companies, sort), [companies, sort]);
  // Связь баннера со строками ниже — тот же приём, что contacts-view.tsx: подсвечиваем и новую
  // компанию, и предложенных кандидатов, чтобы не заставлять сопоставлять текст с таблицей вручную.
  const dedupHighlight = dedup
    ? new Set([dedup.newCompanyId, ...dedup.hint.candidates.map((c) => c.id)])
    : null;

  // Name и колонка действий — всегда видны (toggleable: false), остальное можно спрятать через
  // "Columns" (design review): один источник правды и для меню, и для colSpan пустого состояния.
  const columns = [
    { key: "domain", label: t("companies.list.domain") },
    { key: "industry", label: t("companies.list.industry") },
    { key: "deals", label: t("companies.list.colDeals") },
    { key: "contacts", label: t("companies.list.colContacts") },
  ];
  const { isVisible, toggle: toggleColumn } = useColumnVisibility("companies");
  const columnCount = 2 + columns.filter((c) => isVisible(c.key)).length;

  const toolbar = (
    <TableToolbar
      search={{ value: search, onChange: setSearch, placeholder: t("companies.page.searchPlaceholder") }}
      filters={
        industryOptions.length > 0 && (
          <Select value={industryFilter ?? "all"} onValueChange={(value) => setIndustryFilter(value === "all" ? undefined : value)}>
            <SelectTrigger className="h-9 w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("companies.filter.allIndustries")}</SelectItem>
              {industryOptions.map((industry) => (
                <SelectItem key={industry} value={industry}>
                  {industry}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )
      }
      actions={
        <>
          <ColumnsMenu columns={columns} isVisible={isVisible} onToggle={toggleColumn} triggerLabel={t("table.columns.trigger")} />
          {canCreate && (
            <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              {t("companies.create.trigger")}
            </Button>
          )}
        </>
      }
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {dedup && <CompanyDedupHint hint={dedup.hint} onDismiss={() => setDedup(null)} />}

      <Table toolbar={toolbar} containerClassName="min-h-0 flex-1" className="min-w-[560px]">
        <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
          <TableRow header>
            <SortableTableHead active={sort.key === "name"} direction={sort.direction} onClick={() => toggleSort("name")}>
              {t("companies.list.name")}
            </SortableTableHead>
            {isVisible("domain") && (
              <SortableTableHead active={sort.key === "domain"} direction={sort.direction} onClick={() => toggleSort("domain")}>
                {t("companies.list.domain")}
              </SortableTableHead>
            )}
            {isVisible("industry") && (
              <SortableTableHead active={sort.key === "industry"} direction={sort.direction} onClick={() => toggleSort("industry")}>
                {t("companies.list.industry")}
              </SortableTableHead>
            )}
            {isVisible("deals") && <TableHead>{t("companies.list.colDeals")}</TableHead>}
            {isVisible("contacts") && <TableHead>{t("companies.list.colContacts")}</TableHead>}
            <TableHead className="w-10">
              <span className="sr-only">{t("companies.list.menu")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columnCount}>
                <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
                  <Building2 className="h-8 w-8" />
                  <p>{debounced || industryFilter ? t("companies.page.noResults") : t("companies.page.empty")}</p>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            rows.map((company) => (
              <TableRow key={company.id} className={cn(dedupHighlight?.has(company.id) && "bg-amber-500/5")}>
                <TableCell>
                  <Link
                    to="/companies/$companyId"
                    params={{ companyId: company.id }}
                    className="group inline-flex items-center gap-1 font-medium text-foreground hover:text-accent"
                  >
                    <span className="truncate">{company.name}</span>
                    <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-accent" />
                  </Link>
                </TableCell>
                {isVisible("domain") && <TableCell className="text-muted-foreground">{company.domain ?? "—"}</TableCell>}
                {isVisible("industry") && <TableCell className="text-muted-foreground">{company.industry ?? "—"}</TableCell>}
                {isVisible("deals") && (
                  <TableCell>
                    <DealsPopover
                      projects={company.projects ?? []}
                      canUnlink={canUnlinkDeal}
                      onUnlink={(projectId) => unlinkFromProject.mutate({ projectId })}
                      pending={unlinkFromProject.isPending}
                    />
                  </TableCell>
                )}
                {isVisible("contacts") && (
                  <TableCell>
                    <ContactsPopover contacts={company.contacts ?? []} />
                  </TableCell>
                )}
                <TableCell>
                  {(canUpdate || canDelete) && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" aria-label={t("companies.list.menu")}>
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {canUpdate && (
                          <DropdownMenuItem onSelect={() => setEditTarget(company)}>
                            <Pencil className="h-3.5 w-3.5" />
                            {t("companies.list.edit")}
                          </DropdownMenuItem>
                        )}
                        {canDelete && (
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleteTarget(company)}>
                            <Trash2 className="h-3.5 w-3.5" />
                            {t("companies.list.delete")}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <Pagination
        className="shrink-0"
        page={pagination.page}
        hasPrev={pagination.hasPrev && !isFetching}
        hasNext={hasMore && !isFetching}
        onPrev={pagination.goPrev}
        onNext={() => {
          const lastId = companies.at(-1)?.id;
          if (lastId) pagination.goNext(lastId);
        }}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        pageSizeLabel={t("table.pagination.rowsPerPage")}
        pageLabel={(page) => t("table.pagination.page", { page })}
        prevLabel={t("table.pagination.prevPage")}
        nextLabel={t("table.pagination.nextPage")}
      />

      <CompanyFormDialog
        orgId={orgId}
        company={null}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(created, hint) => {
          if (hint.candidates.length > 0) setDedup({ hint, newCompanyId: created.id });
        }}
      />
      <CompanyFormDialog orgId={orgId} company={editTarget} open={editTarget !== null} onOpenChange={(open) => !open && setEditTarget(null)} />
      <DeleteCompanyDialog
        orgId={orgId}
        company={deleteTarget}
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      />
    </div>
  );
}
