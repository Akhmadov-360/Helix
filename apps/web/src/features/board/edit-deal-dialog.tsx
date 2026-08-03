import { useState } from "react";
import type { CompanyResponse } from "@helix/api-schemas";
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
import { useUpdateProject } from "../project-detail/mutations";
import { CURRENCIES } from "./currencies";

const NO_COMPANY = "__none__";

export interface EditableDeal {
  id: string;
  title: string;
  value: number | null;
  currency: string | null;
  source: string | null;
  companyId: string | null;
}

export function EditDealDialog({
  orgId,
  workspaceId,
  project,
  companies,
  open,
  onOpenChange,
}: {
  orgId: string;
  workspaceId: string;
  project: EditableDeal | null;
  companies: CompanyResponse[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const update = useUpdateProject(orgId, workspaceId, project?.id ?? "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("board.edit.title")}</DialogTitle>
        </DialogHeader>
        {/* key на project.id — реинициализирует локальный стейт формы при каждом открытии на
            новую карточку, тот же паттерн, что PhaseFormDialog (без setState-в-эффекте). */}
        {open && project && (
          <EditDealFields
            key={project.id}
            project={project}
            companies={companies}
            update={update}
            onDone={() => onOpenChange(false)}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditDealFields({
  project,
  companies,
  update,
  onDone,
  onCancel,
}: {
  project: EditableDeal;
  companies: CompanyResponse[];
  update: ReturnType<typeof useUpdateProject>;
  onDone: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [title, setTitle] = useState(project.title);
  const [value, setValue] = useState(project.value !== null ? String(project.value) : "");
  const [currency, setCurrency] = useState(project.currency ?? "USD");
  const [source, setSource] = useState(project.source ?? "");
  const [companyId, setCompanyId] = useState(project.companyId ?? NO_COMPANY);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const parsedValue = value.trim() ? Number(value) : undefined;
    update.mutate(
      {
        title: title.trim(),
        value: parsedValue,
        currency: parsedValue !== undefined ? currency.trim().toUpperCase() : undefined,
        source: source.trim() || undefined,
        companyId: companyId === NO_COMPANY ? null : companyId,
      },
      { onSuccess: onDone },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-deal-title" required>{t("board.create.name")}</Label>
        <Input
          id="edit-deal-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={update.isPending}
          autoFocus
          required
        />
      </div>
      <div className="flex gap-3">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="edit-deal-value">{t("board.create.value")}</Label>
          <Input
            id="edit-deal-value"
            type="number"
            min="0"
            step="0.01"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={update.isPending}
          />
        </div>
        <div className="flex w-28 flex-col gap-1.5">
          <Label htmlFor="edit-deal-currency">{t("board.create.currency")}</Label>
          <Select value={currency} onValueChange={setCurrency} disabled={update.isPending || !value.trim()}>
            <SelectTrigger id="edit-deal-currency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((code) => (
                <SelectItem key={code} value={code}>
                  {code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-deal-source">{t("board.create.source")}</Label>
        <Input
          id="edit-deal-source"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          disabled={update.isPending}
        />
        <p className="text-xs text-muted-foreground">{t("board.create.sourceHint")}</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-deal-company">{t("board.create.company")}</Label>
        <Select value={companyId} onValueChange={setCompanyId} disabled={update.isPending}>
          <SelectTrigger id="edit-deal-company">
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
        <Button type="button" variant="ghost" onClick={onCancel} disabled={update.isPending}>
          {t("board.create.cancel")}
        </Button>
        <Button type="submit" disabled={update.isPending || !title.trim()}>
          {update.isPending ? t("board.edit.submitting") : t("board.edit.submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}
