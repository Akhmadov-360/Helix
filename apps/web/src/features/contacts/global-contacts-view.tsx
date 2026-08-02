import { useMemo, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { MoreHorizontal, Pencil, Plus, Trash2, Users } from "lucide-react";
import type { CompanyResponse, ContactResponse } from "@helix/api-schemas";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  SortableTableHead,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@helix/ui";
import { useCan } from "../../shared/auth/ability";
import { useT } from "../../shared/i18n";
import { ContactFormDialog } from "./contact-form-dialog";
import { DeleteContactDialog } from "./delete-contact-dialog";
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

// companies приходит пропом (join companyId→name, п.6 архитектуры) — тот же приём, что audience
// в contacts-view.tsx: features/* не импортируют друг друга напрямую, композиция на уровне routes/.
export function GlobalContactsView({ orgId, companies }: { orgId: string; companies: CompanyResponse[] }) {
  const t = useT();
  const canCreate = useCan("Contact.create");
  const canUpdate = useCan("Contact.update");
  const canDelete = useCan("Contact.delete");
  const { contacts } = useSuspenseQuery(contactsListQueryOptions(orgId)).data;
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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{t("contacts.page.title")}</h1>
        {canCreate && (
          <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            {t("contacts.page.create.trigger")}
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
          <Users className="h-8 w-8" />
          <p>{t("contacts.page.empty")}</p>
        </div>
      ) : (
        <Table className="min-w-[680px]">
          <TableHeader>
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
              <TableHead className="w-10">
                <span className="sr-only">{t("contacts.list.menu")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((contact) => (
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
            ))}
          </TableBody>
        </Table>
      )}

      <ContactFormDialog orgId={orgId} contact={null} companies={companies} open={createOpen} onOpenChange={setCreateOpen} />
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
