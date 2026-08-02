import { useState } from "react";
import type { CompanyDedupHint, CompanyResponse } from "@helix/api-schemas";
import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, Input, Label } from "@helix/ui";
import { useT } from "../../shared/i18n";
import { useCreateCompany, useUpdateCompany } from "./mutations";

export function CompanyFormDialog({
  orgId,
  company,
  open,
  onOpenChange,
  onCreated,
}: {
  orgId: string;
  company: CompanyResponse | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Только на create (не на edit, дедуп-хинт считается ДО создания, §4.2) — вызывающий (CompaniesView)
  // решает, показывать ли баннер, тот же приём, что ContactsView.handleCreated.
  onCreated?: (company: CompanyResponse, dedupHint: CompanyDedupHint) => void;
}) {
  const t = useT();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{company ? t("companies.edit.title") : t("companies.create.title")}</DialogTitle>
        </DialogHeader>
        {/* key на company.id (или "create") — реинициализирует стейт формы при смене цели/режима,
            тот же приём, что PhaseFormDialog (без setState-в-эффекте). */}
        {open && (
          <CompanyFormFields
            key={company?.id ?? "create"}
            orgId={orgId}
            company={company}
            onDone={() => onOpenChange(false)}
            onCancel={() => onOpenChange(false)}
            onCreated={onCreated}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CompanyFormFields({
  orgId,
  company,
  onDone,
  onCancel,
  onCreated,
}: {
  orgId: string;
  company: CompanyResponse | null;
  onDone: () => void;
  onCancel: () => void;
  onCreated?: (company: CompanyResponse, dedupHint: CompanyDedupHint) => void;
}) {
  const t = useT();
  const create = useCreateCompany(orgId);
  const update = useUpdateCompany(orgId);
  const pending = create.isPending || update.isPending;

  const [name, setName] = useState(company?.name ?? "");
  const [domain, setDomain] = useState(company?.domain ?? "");
  const [industry, setIndustry] = useState(company?.industry ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    if (company) {
      update.mutate(
        {
          companyId: company.id,
          input: { name: name.trim(), domain: domain.trim() || null, industry: industry.trim() || null },
        },
        { onSuccess: onDone },
      );
    } else {
      create.mutate(
        { name: name.trim(), domain: domain.trim() || undefined, industry: industry.trim() || undefined },
        {
          onSuccess: ({ company: created, dedupHint }) => {
            onDone();
            onCreated?.(created, dedupHint);
          },
        },
      );
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="company-name" required>{t("companies.form.name")}</Label>
        <Input id="company-name" value={name} onChange={(e) => setName(e.target.value)} disabled={pending} autoFocus required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="company-domain">{t("companies.form.domain")}</Label>
        <Input id="company-domain" value={domain} onChange={(e) => setDomain(e.target.value)} disabled={pending} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="company-industry">{t("companies.form.industry")}</Label>
        <Input id="company-industry" value={industry} onChange={(e) => setIndustry(e.target.value)} disabled={pending} />
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          {t("companies.form.cancel")}
        </Button>
        <Button type="submit" disabled={pending || !name.trim()}>
          {pending ? t("companies.form.submitting") : t("companies.form.submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}
