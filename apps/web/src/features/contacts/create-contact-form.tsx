import { useState } from "react";
import type { ContactResponse, DedupHint } from "@helix/api-schemas";
import { Button, Card, Input, Label } from "@helix/ui";
import { useT } from "../../shared/i18n";
import { useCreateContact } from "./mutations";

export function CreateContactForm({
  initialName,
  onDone,
  onCancel,
}: {
  initialName: string;
  onDone: (contact: ContactResponse, dedupHint: DedupHint) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const create = useCreateContact();
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    create.mutate(
      { name: name.trim(), email: email.trim() || undefined, phone: phone.trim() || undefined },
      { onSuccess: (res) => onDone(res.contact, res.dedupHint) },
    );
  }

  return (
    <Card className="p-3">
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <p className="text-sm font-medium">{t("contacts.create.title")}</p>
        <div className="flex flex-col gap-1">
          <Label htmlFor="contact-name" required>{t("contacts.create.name")}</Label>
          <Input id="contact-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="contact-email">{t("contacts.create.email")}</Label>
          <Input id="contact-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="contact-phone">{t("contacts.create.phone")}</Label>
          <Input id="contact-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={create.isPending || !name.trim()}>
            {t("contacts.create.submit")}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            {t("contacts.create.cancel")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
