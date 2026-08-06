import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Briefcase, Link2Off, MoreHorizontal, Pencil, Plus, Trash2, Users } from "lucide-react";
import type { CompanyResponse, ContactResponse, DealLink, DedupHint as DedupHintData } from "@helix/api-schemas";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
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
import { ContactFormDialog } from "./contact-form-dialog";
import { DedupHint } from "./dedup-hint";
import { DeleteContactDialog } from "./delete-contact-dialog";
import { invalidateContactsList, useLoadMoreContacts, useMergeContactGlobal, useUnlinkContact } from "./mutations";
import { contactsListQueryOptions } from "./queries";

type SortKey = "name" | "email" | "phone" | "company";
type SortDirection = "asc" | "desc";
interface SortState {
  key: SortKey;
  direction: SortDirection;
}

interface Row extends ContactResponse {
  companyName: string;
}

function sortRows(rows: Row[], sort: SortState): Row[] {
  const dir = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = sort.key === "company" ? a.companyName : (a[sort.key] ?? "");
    const bv = sort.key === "company" ? b.companyName : (b[sort.key] ?? "");
    return av.localeCompare(bv) * dir;
  });
}

// Один пункт списка — своя инстанция useUnlinkContact(orgId, projectId): у разных строк/пунктов
// разные projectId, а хук привязан к КОНКРЕТНОМУ проекту (как в contacts-view.tsx) — вызывать его
// условно внутри .map() на родителе было бы нарушением правил хуков, отдельный компонент — нет.
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

// Единый Popover-триггер вместо ряда чипов (design review — тот же приём, что companies-view.tsx
// DealsPopover): счётчик, клик открывает скроллящийся список сделок со ссылкой + красной
// иконкой отвязки у каждой, вместо "нескольких badge подряд" (не читалось как одно целое,
// не масштабировалось на много сделок).
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
          <DealRow key={project.id} orgId={orgId} contactId={contactId} project={project} canUnlink={canUnlink} onUnlinked={onUnlinked} />
        ))}
      </PopoverContent>
    </Popover>
  );
}

// companies приходит пропом (join companyId→name, п.6 архитектуры) — тот же приём, что audience
// в contacts-view.tsx: features/* не импортируют друг друга напрямую, композиция на уровне routes/.
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

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const query = useMemo(() => ({ q: debounced || undefined }), [debounced]);

  // useQuery (не useSuspenseQuery): смена поискового запроса меняет query-key (queryKeys.
  // contactsList), useSuspenseQuery на новом ключе снёс бы всю таблицу в fallback на каждую
  // паузу дебаунса. placeholderData держит предыдущую страницу на экране, пока грузится новая
  // (route-loader уже прогрел кэш пустого запроса — первый рендер без запроса всё равно мгновенный).
  const { data, isFetching } = useQuery({ ...contactsListQueryOptions(orgId, query), placeholderData: keepPreviousData });
  const contacts = useMemo(() => data?.contacts ?? [], [data]);
  const hasMore = data?.hasMore ?? false;
  const loadMore = useLoadMoreContacts(orgId, query);

  const [sort, setSort] = useState<SortState>({ key: "name", direction: "asc" });
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ContactResponse | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ContactResponse | null>(null);

  const companyNameById = useMemo(() => new Map(companies.map((c) => [c.id, c.name])), [companies]);
  const rows = useMemo(() => {
    const withCompany: Row[] = contacts.map((contact) => ({
      ...contact,
      companyName: contact.companyId ? (companyNameById.get(contact.companyId) ?? "") : "",
    }));
    return sortRows(withCompany, sort);
  }, [contacts, companyNameById, sort]);

  function toggleSort(key: SortKey) {
    setSort((prev) => (prev.key === key ? { key, direction: prev.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" }));
  }

  const toolbar = (
    <TableToolbar
      search={{ value: search, onChange: setSearch, placeholder: t("contacts.page.searchPlaceholder") }}
      actions={
        canCreate && (
          <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            {t("contacts.page.create.trigger")}
          </Button>
        )
      }
    />
  );
  const columnCount = 6;

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
      <Table toolbar={toolbar} containerClassName="min-h-0 flex-1" className="min-w-[820px]">
        <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
          <TableRow header>
            <SortableTableHead active={sort.key === "name"} direction={sort.direction} onClick={() => toggleSort("name")}>
              {t("contacts.list.colName")}
            </SortableTableHead>
            <SortableTableHead active={sort.key === "email"} direction={sort.direction} onClick={() => toggleSort("email")}>
              {t("contacts.list.colEmail")}
            </SortableTableHead>
            <SortableTableHead active={sort.key === "phone"} direction={sort.direction} onClick={() => toggleSort("phone")}>
              {t("contacts.list.colPhone")}
            </SortableTableHead>
            <SortableTableHead active={sort.key === "company"} direction={sort.direction} onClick={() => toggleSort("company")}>
              {t("contacts.list.colCompany")}
            </SortableTableHead>
            <TableHead>{t("contacts.list.colProjects")}</TableHead>
            <TableHead className="w-10">
              <span className="sr-only">{t("contacts.list.menu")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columnCount}>
                <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
                  <Users className="h-8 w-8" />
                  <p>{debounced ? t("contacts.page.noResults") : t("contacts.page.empty")}</p>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            rows.map((contact) => (
                <TableRow key={contact.id}>
                  <TableCell>
                    <Link to="/contacts/$contactId" params={{ contactId: contact.id }} className="font-medium text-foreground hover:text-accent">
                      {contact.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{contact.email ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{contact.phone ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {contact.companyId ? (
                      <Link to="/companies/$companyId" params={{ companyId: contact.companyId }} className="hover:text-accent hover:underline">
                        {contact.companyName || "—"}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <DealsPopover
                      orgId={orgId}
                      contactId={contact.id}
                      projects={contact.projects ?? []}
                      canUnlink={canUnlink}
                      onUnlinked={() => invalidateContactsList(queryClient, orgId)}
                    />
                  </TableCell>
                  <TableCell>
                    {(canUpdate || canDelete) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" aria-label={t("contacts.list.menu")}>
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {canUpdate && (
                            <DropdownMenuItem onSelect={() => setEditTarget(contact)}>
                              <Pencil className="h-3.5 w-3.5" />
                              {t("contacts.list.edit")}
                            </DropdownMenuItem>
                          )}
                          {canDelete && (
                            <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleteTarget(contact)}>
                              <Trash2 className="h-3.5 w-3.5" />
                              {t("contacts.list.delete")}
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
      {hasMore && (
        <div className="flex shrink-0 justify-center">
          <Button type="button" variant="outline" size="sm" onClick={() => loadMore.mutate()} disabled={loadMore.isPending || isFetching}>
            {loadMore.isPending ? t("contacts.list.loadingMore") : t("contacts.list.loadMore")}
          </Button>
        </div>
      )}

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
