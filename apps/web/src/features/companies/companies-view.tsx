import { useCallback, useMemo, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Briefcase,
  Building2,
  Link2Off,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import type {
  CompanyDedupHint as CompanyDedupHintData,
  CompanyResponse,
  ContactLink,
  DealLink,
} from "@helix/api-schemas";
import {
  Avatar,
  avatarVariants,
  Button,
  cn,
  CountBadge,
  DataTable,
  type DataTableColumn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@helix/ui";
import { useCan } from "../../shared/auth/ability";
import { useT } from "../../shared/i18n";
import { CompanyDedupHint } from "./company-dedup-hint";
import { CompanyFormDialog } from "./company-form-dialog";
import {
  initialCompaniesFilter,
  isCompaniesFilterActive,
  type CompaniesFilterState,
} from "./companies-filter-state";
import { CompaniesFilterChips } from "./companies-filters";
import { DeleteCompanyDialog } from "./delete-company-dialog";
import { useUnlinkCompanyFromProject } from "./mutations";
import { companiesListQueryOptions } from "./queries";

// Тот же порог, что project-card.tsx MAX_VISIBLE_ASSIGNEES — единая граница «стек vs +N».
const MAX_VISIBLE_CONTACTS = 3;

// Load-all стратегия (M1-масштаб): один запрос limit=500, DataTable гоняет поиск/фильтр/пагинацию
// клиентом. При приближении к порогу — переход на offset-server, TODO для M6.
const COMPANIES_LIMIT = 500;

interface Row extends CompanyResponse {
  dealsCount: number;
}

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
          <div
            key={project.id}
            className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
          >
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

  const { companies } = useSuspenseQuery(
    companiesListQueryOptions(orgId, { limit: COMPANIES_LIMIT }),
  ).data;

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<CompaniesFilterState>(initialCompaniesFilter);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CompanyResponse | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CompanyResponse | null>(null);
  const [dedup, setDedup] = useState<{ hint: CompanyDedupHintData; newCompanyId: string } | null>(null);

  const rows = useMemo<Row[]>(
    () => companies.map((c) => ({ ...c, dealsCount: c.projects?.length ?? 0 })),
    [companies],
  );

  // Опции для фильтра "Индустрия" — из общего load-all-набора, без учёта поиска (иначе список
  // схлопнется как только применил фильтр — типичный UX-баг «нет ничего кроме уже выбранного»).
  const industryOptions = useMemo(
    () => [...new Set(companies.map((c) => c.industry).filter((v): v is string => !!v))].sort(),
    [companies],
  );

  const filterMatches = useCallback(
    (row: Row) => {
      if (filters.industries.size > 0) {
        if (!row.industry || !filters.industries.has(row.industry)) return false;
      }
      if (filters.minDeals !== null && row.dealsCount < filters.minDeals) return false;
      return true;
    },
    [filters],
  );

  const matches = (row: Row, q: string) => {
    const needle = q.toLowerCase();
    return (
      row.name.toLowerCase().includes(needle) ||
      (row.domain ?? "").toLowerCase().includes(needle) ||
      (row.industry ?? "").toLowerCase().includes(needle)
    );
  };

  // Подсветка dedup-строк — новая компания + предложенные кандидаты (тот же приём, что раньше).
  const dedupHighlight = useMemo(
    () =>
      dedup ? new Set([dedup.newCompanyId, ...dedup.hint.candidates.map((c) => c.id)]) : null,
    [dedup],
  );

  const columns = useMemo<DataTableColumn<Row>[]>(
    () => [
      {
        key: "name",
        header: t("companies.list.name"),
        hideable: false,
        cell: (row) => (
          <Link
            to="/companies/$companyId"
            params={{ companyId: row.id }}
            className="group inline-flex items-center gap-1 font-medium text-foreground hover:text-accent"
          >
            <span className="truncate">{row.name}</span>
            <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-accent" />
          </Link>
        ),
      },
      {
        key: "domain",
        header: t("companies.list.domain"),
        cell: (row) => <span className="text-muted-foreground">{row.domain ?? "—"}</span>,
      },
      {
        key: "industry",
        header: t("companies.list.industry"),
        cell: (row) => <span className="text-muted-foreground">{row.industry ?? "—"}</span>,
      },
      {
        key: "deals",
        header: t("companies.list.colDeals"),
        cell: (row) => (
          <DealsPopover
            projects={row.projects ?? []}
            canUnlink={canUnlinkDeal}
            onUnlink={(projectId) => unlinkFromProject.mutate({ projectId })}
            pending={unlinkFromProject.isPending}
          />
        ),
      },
      {
        key: "contacts",
        header: t("companies.list.colContacts"),
        cell: (row) => <ContactsPopover contacts={row.contacts ?? []} />,
      },
    ],
    [t, canUnlinkDeal, unlinkFromProject],
  );

  const canRowAction = canUpdate || canDelete;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {dedup && <CompanyDedupHint hint={dedup.hint} onDismiss={() => setDedup(null)} />}

      <DataTable
        columns={columns}
        data={rows}
        getRowKey={(row) => row.id}
        ariaLabel={t("companies.page.title")}
        title={
          <span className="flex items-center gap-2">
            {t("companies.page.title")}
            <CountBadge value={rows.length} />
          </span>
        }
        actions={
          canCreate && (
            <Button type="button" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t("companies.create.trigger")}
            </Button>
          )
        }
        search={{
          value: search,
          onChange: setSearch,
          placeholder: t("companies.page.searchPlaceholder"),
          matches,
        }}
        filterChips={
          <CompaniesFilterChips state={filters} onChange={setFilters} industries={industryOptions} />
        }
        filterMatches={filterMatches}
        controlLabels={{
          fields: t("dataTable.fields"),
          rowHeight: t("dataTable.rowHeight"),
          rowHeightCompact: t("dataTable.rowHeight.compact"),
          rowHeightComfortable: t("dataTable.rowHeight.comfortable"),
          rowHeightSpacious: t("dataTable.rowHeight.spacious"),
        }}
        rowClassName={(row) => (dedupHighlight?.has(row.id) ? "bg-amber-500/5" : undefined)}
        rowActions={
          canRowAction
            ? (row) => (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground"
                      aria-label={t("companies.list.menu")}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {canUpdate && (
                      <DropdownMenuItem onSelect={() => setEditTarget(row)}>
                        <Pencil className="h-3.5 w-3.5" />
                        {t("companies.list.edit")}
                      </DropdownMenuItem>
                    )}
                    {canDelete && (
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={() => setDeleteTarget(row)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {t("companies.list.delete")}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )
            : undefined
        }
        emptyState={
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-muted text-muted-foreground">
              <Building2 className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                {search.trim() || isCompaniesFilterActive(filters)
                  ? t("companies.noResultsTitle")
                  : t("companies.emptyTitle")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {search.trim() || isCompaniesFilterActive(filters)
                  ? t("companies.noResultsBody")
                  : t("companies.emptyBody")}
              </p>
            </div>
            {!search.trim() && !isCompaniesFilterActive(filters) && canCreate && (
              <Button type="button" className="mt-2" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t("companies.create.trigger")}
              </Button>
            )}
          </div>
        }
        pagination={{
          initialPageSize: 25,
          labels: {
            perPageLabel: (size) => t("dataTable.perPage", { size: String(size) }),
            prevLabel: t("table.pagination.prevPage"),
            nextLabel: t("dataTable.next"),
            pageAriaLabel: (p) => t("table.pagination.page", { page: String(p) }),
            navAriaLabel: t("dataTable.paginationNav"),
          },
        }}
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
      <CompanyFormDialog
        orgId={orgId}
        company={editTarget}
        open={editTarget !== null}
        onOpenChange={(open) => !open && setEditTarget(null)}
      />
      <DeleteCompanyDialog
        orgId={orgId}
        company={deleteTarget}
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      />
    </div>
  );
}
