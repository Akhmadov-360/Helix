import { useEffect, useState } from "react";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Pencil, Plus, Search, Trash2, UserMinus } from "lucide-react";
import type { ContactResponse } from "@helix/api-schemas";
import { Button, Input, Popover, PopoverContent, PopoverTrigger } from "@helix/ui";
import { useCan } from "../../shared/auth/ability";
import { useT } from "../../shared/i18n";
import { CompanyFormDialog } from "./company-form-dialog";
import { DeleteCompanyDialog } from "./delete-company-dialog";
import { useSetContactCompany } from "./mutations";
import { companyContactSearchQueryOptions, companyQueryOptions } from "./queries";

// Поиск + привязка существующего контакта (design review — раньше единственный путь был
// «иди в /contacts, создай там, привяжи через форму»). Свой локальный дебаунс, тот же приём,
// что contacts/contact-search.tsx, но без create-новый-контакт веткой — здесь только линковка
// существующего, создание с нуля остаётся на /contacts (не дублируем форму создания тут).
function LinkContactPopover({
  orgId,
  companyId,
  excludeIds,
}: {
  orgId: string;
  companyId: string;
  excludeIds: Set<string>;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const link = useSetContactCompany(orgId, companyId);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  // enabled: open — запрос только когда попап реально открыт, а не на каждый рендер страницы
  // компании (компонент всегда смонтирован, меняется только open). Без q — браузинг первых
  // контактов орги (design review): иначе непонятно, кого вообще можно привязать.
  const search = useQuery({ ...companyContactSearchQueryOptions(orgId, debounced), enabled: open });
  const results = (search.data?.contacts ?? []).filter((c) => !excludeIds.has(c.id));

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setQuery("");
          setDebounced("");
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Plus className="h-3.5 w-3.5" />
          {t("companies.detail.linkContact")}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("companies.detail.searchPlaceholder")}
            className="h-9 pl-8"
          />
        </div>
        {!search.isFetching && (
          <div className="scroll-slim flex max-h-56 flex-col gap-0.5 overflow-y-auto">
            {results.length > 0 ? (
              results.map((contact) => (
                <button
                  key={contact.id}
                  type="button"
                  onClick={() => link.mutate({ contactId: contact.id, link: true }, { onSuccess: () => setOpen(false) })}
                  disabled={link.isPending}
                  className="flex flex-col items-start rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                >
                  <span className="font-medium">{contact.name}</span>
                  <span className="text-xs text-muted-foreground">{contact.phone ?? contact.email ?? "—"}</span>
                </button>
              ))
            ) : (
              <p className="px-2 py-1.5 text-sm text-muted-foreground">{t("companies.detail.noResults")}</p>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function CompanyDetailView({ orgId, companyId }: { orgId: string; companyId: string }) {
  const t = useT();
  const navigate = useNavigate();
  const canUpdate = useCan("Company.update");
  const canDelete = useCan("Company.delete");
  const canManageContacts = useCan("Contact.update");
  const company = useSuspenseQuery(companyQueryOptions(orgId, companyId)).data;
  const unlinkContact = useSetContactCompany(orgId, companyId);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <Link to="/companies" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" />
        {t("companies.detail.back")}
      </Link>

      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{company.name}</h1>
        <div className="flex gap-2">
          {canUpdate && (
            <Button type="button" variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3.5 w-3.5" />
              {t("companies.list.edit")}
            </Button>
          )}
          {canDelete && (
            <Button type="button" variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-3.5 w-3.5" />
              {t("companies.list.delete")}
            </Button>
          )}
        </div>
      </div>

      <dl className="flex flex-col gap-2 text-sm">
        <div className="flex gap-2">
          <dt className="w-20 shrink-0 text-muted-foreground">{t("companies.detail.domain")}</dt>
          <dd>{company.domain ?? "—"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-20 shrink-0 text-muted-foreground">{t("companies.detail.industry")}</dt>
          <dd>{company.industry ?? "—"}</dd>
        </div>
      </dl>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">{t("companies.detail.contacts")}</h2>
          {canManageContacts && (
            <LinkContactPopover orgId={orgId} companyId={companyId} excludeIds={new Set(company.contacts.map((c) => c.id))} />
          )}
        </div>
        {company.contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("companies.detail.contactsEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {company.contacts.map((contact: ContactResponse) => (
              <li key={contact.id} className="flex items-center justify-between gap-2">
                <Link to="/contacts/$contactId" params={{ contactId: contact.id }} className="text-sm text-primary hover:underline">
                  {contact.name}
                </Link>
                {canManageContacts && (
                  <button
                    type="button"
                    onClick={() => unlinkContact.mutate({ contactId: contact.id, link: false })}
                    disabled={unlinkContact.isPending}
                    aria-label={t("companies.detail.unlinkContact")}
                    className="rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
                  >
                    <UserMinus className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <CompanyFormDialog orgId={orgId} company={editOpen ? company : null} open={editOpen} onOpenChange={setEditOpen} />
      <DeleteCompanyDialog
        orgId={orgId}
        company={deleteOpen ? company : null}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={() => void navigate({ to: "/companies" })}
      />
    </div>
  );
}
