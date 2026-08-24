import { useCallback, useMemo, useState } from "react";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Briefcase,
  Link2Off,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import type {
  CompanyResponse,
  ContactResponse,
  DealLink,
  DedupHint as DedupHintData,
} from "@helix/api-schemas";
import {
  Button,
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
import { ContactFormDialog } from "./contact-form-dialog";
import {
  initialContactsFilter,
  isContactsFilterActive,
  type ContactsFilterState,
} from "./contacts-filter-state";
import { ContactsFilterChips } from "./contacts-filters";
import { DedupHint } from "./dedup-hint";
import { DeleteContactDialog } from "./delete-contact-dialog";
import { invalidateContactsList, useMergeContactGlobal, useUnlinkContact } from "./mutations";
import { contactsListQueryOptions } from "./queries";

// Load-all стратегия (M1-масштаб, cursor→client-side): один запрос limit=CONTACTS_LIMIT,
// DataTable делает поиск/фильтр/пагинацию/сорт локально. При приближении к лимиту (hasMore=true)
// нужен переход на offset-серверную пагинацию — TODO для M6, когда данные вырастут.
const CONTACTS_LIMIT = 500;

interface Row extends ContactResponse {
  companyName: string;
  dealsCount: number;
}

// Один пункт списка — своя инстанция useUnlinkContact(orgId, projectId): у разных строк/пунктов
// разные projectId, а хук привязан к КОНКРЕТНОМУ проекту — вызывать его условно в .map() было бы
// нарушением правил хуков.
function DealRow({
  orgId,
  contactId,
  project,
  canUnlink,
  onUnlinked,
}: {
  orgId: string;
  contactId: string;
  project: DealLink;
  canUnlink: boolean;
  onUnlinked: () => void;
}) {
  const t = useT();
  const unlink = useUnlinkContact(orgId, project.id);

  return (
    <div className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
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
          onClick={() => unlink.mutate({ contactId }, { onSuccess: onUnlinked })}
          disabled={unlink.isPending}
          aria-label={t("contacts.list.unlink")}
          className="shrink-0 rounded p-1 text-destructive transition-colors hover:bg-destructive/10"
        >
          <Link2Off className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function DealsPopover({
  orgId,
  contactId,
  projects,
  canUnlink,
  onUnlinked,
}: {
  orgId: string;
  contactId: string;
  projects: DealLink[];
  canUnlink: boolean;
  onUnlinked: () => void;
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
          {t("contacts.list.dealsTrigger", { count: projects.length })}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex max-h-64 w-64 flex-col gap-0.5 overflow-y-auto p-2">
        {projects.map((project) => (
          <DealRow
            key={project.id}
            orgId={orgId}
            contactId={contactId}
            project={project}
            canUnlink={canUnlink}
            onUnlinked={onUnlinked}
          />
        ))}
      </PopoverContent>
    </Popover>
  );
}

// companies приходит пропом (join companyId→name) — тот же приём что audience в contacts-view.tsx:
// features/* не импортируют друг друга напрямую, композиция на уровне routes/.
export function GlobalContactsView({ orgId, companies }: { orgId: string; companies: CompanyResponse[] }) {
  const t = useT();
  const queryClient = useQueryClient();
  const canCreate = useCan("Contact.create");
  const canUpdate = useCan("Contact.update");
  const canDelete = useCan("Contact.delete");
  const canUnlink = useCan("ProjectContact.delete");
  const canMerge = useCan("Contact.merge");
  const merge = useMergeContactGlobal(orgId);
  const [dedup, setDedup] = useState<{ hint: DedupHintData; newContactId: string } | null>(null);

  // Один запрос без cursor: DataTable делает поиск/фильтр/пагинацию клиентом.
  const { contacts } = useSuspenseQuery(
    contactsListQueryOptions(orgId, { limit: CONTACTS_LIMIT }),
  ).data;

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<ContactsFilterState>(initialContactsFilter);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ContactResponse | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ContactResponse | null>(null);

  const companyNameById = useMemo(() => new Map(companies.map((c) => [c.id, c.name])), [companies]);

  const rows = useMemo<Row[]>(
    () =>
      contacts.map((contact) => ({
        ...contact,
        companyName: contact.companyId ? (companyNameById.get(contact.companyId) ?? "") : "",
        dealsCount: contact.projects?.length ?? 0,
      })),
    [contacts, companyNameById],
  );

  const filterMatches = useCallback(
    (row: Row) => {
      if (filters.companies.size > 0) {
        if (!row.companyId || !filters.companies.has(row.companyId)) return false;
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
      (row.email ?? "").toLowerCase().includes(needle) ||
      (row.phone ?? "").toLowerCase().includes(needle) ||
      row.companyName.toLowerCase().includes(needle)
    );
  };

  const columns = useMemo<DataTableColumn<Row>[]>(
    () => [
      {
        key: "name",
        header: t("contacts.list.colName"),
        hideable: false,
        cell: (row) => (
          <Link
            to="/contacts/$contactId"
            params={{ contactId: row.id }}
            className="group inline-flex items-center gap-1 font-medium text-foreground hover:text-accent"
          >
            <span className="truncate">{row.name}</span>
            <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-accent" />
          </Link>
        ),
      },
      {
        key: "email",
        header: t("contacts.list.colEmail"),
        cell: (row) => <span className="text-muted-foreground">{row.email ?? "—"}</span>,
      },
      {
        key: "phone",
        header: t("contacts.list.colPhone"),
        cell: (row) => <span className="text-muted-foreground">{row.phone ?? "—"}</span>,
      },
      {
        key: "company",
        header: t("contacts.list.colCompany"),
        cell: (row) =>
          row.companyId ? (
            <Link
              to="/companies/$companyId"
              params={{ companyId: row.companyId }}
              className="text-muted-foreground hover:text-accent hover:underline"
            >
              {row.companyName || "—"}
            </Link>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        key: "projects",
        header: t("contacts.list.colProjects"),
        cell: (row) => (
          <DealsPopover
            orgId={orgId}
            contactId={row.id}
            projects={row.projects ?? []}
            canUnlink={canUnlink}
            onUnlinked={() => invalidateContactsList(queryClient, orgId)}
          />
        ),
      },
    ],
    [t, orgId, canUnlink, queryClient],
  );

  const canRowAction = canUpdate || canDelete;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {dedup && (
        <DedupHint
          hint={dedup.hint}
          canMerge={canMerge}
          onMerge={(candidateId) => {
            merge.mutate({ targetId: candidateId, sourceId: dedup.newContactId });
            setDedup(null);
          }}
          onDismiss={() => setDedup(null)}
        />
      )}
      <DataTable
        columns={columns}
        data={rows}
        getRowKey={(row) => row.id}
        ariaLabel={t("contacts.page.title")}
        title={
          <span className="flex items-center gap-2">
            {t("contacts.page.title")}
            <CountBadge value={rows.length} />
          </span>
        }
        actions={
          canCreate && (
            <Button type="button" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t("contacts.page.create.trigger")}
            </Button>
          )
        }
        search={{
          value: search,
          onChange: setSearch,
          placeholder: t("contacts.page.searchPlaceholder"),
          matches,
        }}
        filterChips={<ContactsFilterChips state={filters} onChange={setFilters} companies={companies} />}
        filterMatches={filterMatches}
        controlLabels={{
          fields: t("dataTable.fields"),
          rowHeight: t("dataTable.rowHeight"),
          rowHeightCompact: t("dataTable.rowHeight.compact"),
          rowHeightComfortable: t("dataTable.rowHeight.comfortable"),
          rowHeightSpacious: t("dataTable.rowHeight.spacious"),
        }}
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
                      aria-label={t("contacts.list.menu")}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {canUpdate && (
                      <DropdownMenuItem onSelect={() => setEditTarget(row)}>
                        <Pencil className="h-3.5 w-3.5" />
                        {t("contacts.list.edit")}
                      </DropdownMenuItem>
                    )}
                    {canDelete && (
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={() => setDeleteTarget(row)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {t("contacts.list.delete")}
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
              <Users className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                {search.trim() || isContactsFilterActive(filters)
                  ? t("contacts.noResultsTitle")
                  : t("contacts.emptyTitle")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {search.trim() || isContactsFilterActive(filters)
                  ? t("contacts.noResultsBody")
                  : t("contacts.emptyBody")}
              </p>
            </div>
            {!search.trim() && !isContactsFilterActive(filters) && canCreate && (
              <Button type="button" className="mt-2" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t("contacts.page.create.trigger")}
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

      <ContactFormDialog
        orgId={orgId}
        contact={null}
        companies={companies}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(newContactId, hint) => setDedup({ hint, newContactId })}
      />
      <ContactFormDialog
        orgId={orgId}
        contact={editTarget}
        companies={companies}
        open={editTarget !== null}
        onOpenChange={(open) => !open && setEditTarget(null)}
      />
      <DeleteContactDialog
        orgId={orgId}
        contact={deleteTarget}
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      />
    </div>
  );
}
