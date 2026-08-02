import { useMemo, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import type { CompanyResponse } from "@helix/api-schemas";
import { Button } from "@helix/ui";
import { useCan } from "../../shared/auth/ability";
import { useT } from "../../shared/i18n";
import { ContactFormDialog } from "./contact-form-dialog";
import { DeleteContactDialog } from "./delete-contact-dialog";
import { contactQueryOptions } from "./queries";

export function ContactDetailView({
  orgId,
  contactId,
  companies,
}: {
  orgId: string;
  contactId: string;
  companies: CompanyResponse[];
}) {
  const t = useT();
  const navigate = useNavigate();
  const canUpdate = useCan("Contact.update");
  const canDelete = useCan("Contact.delete");
  const contact = useSuspenseQuery(contactQueryOptions(orgId, contactId)).data;
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const company = useMemo(
    () => (contact.companyId ? (companies.find((c) => c.id === contact.companyId) ?? null) : null),
    [companies, contact.companyId],
  );

  return (
    <div className="flex flex-col gap-4">
      <Link to="/contacts" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" />
        {t("contacts.detail.back")}
      </Link>

      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{contact.name}</h1>
        <div className="flex gap-2">
          {canUpdate && (
            <Button type="button" variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3.5 w-3.5" />
              {t("contacts.list.edit")}
            </Button>
          )}
          {canDelete && (
            <Button type="button" variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-3.5 w-3.5" />
              {t("contacts.list.delete")}
            </Button>
          )}
        </div>
      </div>

      <dl className="flex flex-col gap-2 text-sm">
        <div className="flex gap-2">
          <dt className="w-20 shrink-0 text-muted-foreground">{t("contacts.detail.email")}</dt>
          <dd>{contact.email ?? "—"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-20 shrink-0 text-muted-foreground">{t("contacts.detail.phone")}</dt>
          <dd>{contact.phone ?? "—"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-20 shrink-0 text-muted-foreground">{t("contacts.form.company")}</dt>
          <dd>
            {company ? (
              <Link to="/companies/$companyId" params={{ companyId: company.id }} className="text-primary hover:underline">
                {company.name}
              </Link>
            ) : (
              "—"
            )}
          </dd>
        </div>
      </dl>

      <ContactFormDialog orgId={orgId} contact={editOpen ? contact : null} companies={companies} open={editOpen} onOpenChange={setEditOpen} />
      <DeleteContactDialog
        orgId={orgId}
        contact={deleteOpen ? contact : null}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={() => void navigate({ to: "/contacts" })}
      />
    </div>
  );
}
