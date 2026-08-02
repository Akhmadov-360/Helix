import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { Button } from "@helix/ui";
import { useCan } from "../../shared/auth/ability";
import { useT } from "../../shared/i18n";
import { CompanyFormDialog } from "./company-form-dialog";
import { DeleteCompanyDialog } from "./delete-company-dialog";
import { companyQueryOptions } from "./queries";

export function CompanyDetailView({ orgId, companyId }: { orgId: string; companyId: string }) {
  const t = useT();
  const navigate = useNavigate();
  const canUpdate = useCan("Company.update");
  const canDelete = useCan("Company.delete");
  const company = useSuspenseQuery(companyQueryOptions(orgId, companyId)).data;
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
        <h2 className="text-sm font-semibold">{t("companies.detail.contacts")}</h2>
        {company.contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("companies.detail.contactsEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {company.contacts.map((contact) => (
              <li key={contact.id}>
                <Link to="/contacts/$contactId" params={{ contactId: contact.id }} className="text-sm text-primary hover:underline">
                  {contact.name}
                </Link>
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
