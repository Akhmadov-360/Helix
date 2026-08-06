import { useState } from "react";
import type { CompanyResponse, ContactResponse, DedupHint } from "@helix/api-schemas";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@helix/ui";
import { useT } from "../../shared/i18n";
import { useCreateContact, useUpdateContact } from "./mutations";

const NO_COMPANY = "__none__";

// companies приходит пропом (не собственным запросом) — тот же приём, что audience в contacts-view.tsx:
// features/* не импортируют друг друга напрямую, композиция — на уровне routes/.
export function ContactFormDialog({
  orgId,
  contact,
  companies,
  open,
  onOpenChange,
  onCreated,
}: {
  orgId: string;
  contact: ContactResponse | null;
  companies: CompanyResponse[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Только create возвращает dedupHint (§4.1) — update не проверяет дубли повторно.
  onCreated?: (newContactId: string, hint: DedupHint) => void;
}) {
  const t = useT();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{contact ? t("contacts.edit.title") : t("contacts.create.title")}</DialogTitle>
        </DialogHeader>
        {open && (
          <ContactFormFields
            key={contact?.id ?? "create"}
            orgId={orgId}
            contact={contact}
            companies={companies}
            onDone={() => onOpenChange(false)}
            onCreated={onCreated}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ContactFormFields({
  orgId,
  contact,
  companies,
  onDone,
  onCreated,
  onCancel,
}: {
  orgId: string;
  contact: ContactResponse | null;
  companies: CompanyResponse[];
  onDone: () => void;
  onCreated?: (newContactId: string, hint: DedupHint) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const create = useCreateContact(orgId);
  const update = useUpdateContact(orgId);
  const pending = create.isPending || update.isPending;

  const [name, setName] = useState(contact?.name ?? "");
  const [email, setEmail] = useState(contact?.email ?? "");
  const [phone, setPhone] = useState(contact?.phone ?? "");
  const [companyId, setCompanyId] = useState(contact?.companyId ?? NO_COMPANY);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const resolvedCompanyId = companyId === NO_COMPANY ? null : companyId;

    if (contact) {
      update.mutate(
        {
          contactId: contact.id,
          input: {
            name: name.trim(),
            email: email.trim() || null,
            phone: phone.trim() || null,
            companyId: resolvedCompanyId,
          },
        },
        { onSuccess: onDone },
      );
    } else {
      create.mutate(
        {
          name: name.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          companyId: resolvedCompanyId ?? undefined,
        },
        {
          onSuccess: (res) => {
            onDone();
            if (res.dedupHint.candidates.length > 0) onCreated?.(res.contact.id, res.dedupHint);
          },
        },
      );
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="contact-form-name" required>{t("contacts.create.name")}</Label>
        <Input id="contact-form-name" value={name} onChange={(e) => setName(e.target.value)} disabled={pending} autoFocus required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="contact-form-email">{t("contacts.create.email")}</Label>
        <Input id="contact-form-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={pending} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="contact-form-phone">{t("contacts.create.phone")}</Label>
        <Input id="contact-form-phone" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={pending} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="contact-form-company">{t("contacts.form.company")}</Label>
        <Select value={companyId} onValueChange={setCompanyId} disabled={pending}>
          <SelectTrigger id="contact-form-company">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_COMPANY}>{t("contacts.form.companyNone")}</SelectItem>
            {companies.map((company) => (
              <SelectItem key={company.id} value={company.id}>
                {company.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          {t("contacts.create.cancel")}
        </Button>
        <Button type="submit" disabled={pending || !name.trim()}>
          {pending ? t("companies.form.submitting") : t("companies.form.submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}
