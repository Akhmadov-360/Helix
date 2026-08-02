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
import { CURRENCIES } from "./currencies";
import { useCreateProject } from "./mutations";

const NO_COMPANY = "__none__";

export function CreateDealDialog({
  orgId,
  workspaceId,
  companies,
  open,
  onOpenChange,
}: {
  orgId: string;
  workspaceId: string;
  companies: CompanyResponse[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const create = useCreateProject(orgId, workspaceId);
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [source, setSource] = useState("");
  const [companyId, setCompanyId] = useState(NO_COMPANY);

  function reset() {
    setTitle("");
    setValue("");
    setCurrency("USD");
    setSource("");
    setCompanyId(NO_COMPANY);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const parsedValue = value.trim() ? Number(value) : undefined;
    create.mutate(
      {
        title: title.trim(),
        value: parsedValue,
        currency: parsedValue !== undefined ? currency.trim().toUpperCase() : undefined,
        source: source.trim() || undefined,
        companyId: companyId === NO_COMPANY ? undefined : companyId,
      },
      {
        onSuccess: () => {
          reset();
          onOpenChange(false);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("board.create.title")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="deal-title" required>{t("board.create.name")}</Label>
            <Input
              id="deal-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={create.isPending}
              autoFocus
              required
            />
          </div>
          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="deal-value">{t("board.create.value")}</Label>
              <Input
                id="deal-value"
                type="number"
                min="0"
                step="0.01"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                disabled={create.isPending}
              />
            </div>
            <div className="flex w-28 flex-col gap-1.5">
              <Label htmlFor="deal-currency">{t("board.create.currency")}</Label>
              <Select value={currency} onValueChange={setCurrency} disabled={create.isPending || !value.trim()}>
                <SelectTrigger id="deal-currency">
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
            <Label htmlFor="deal-source">{t("board.create.source")}</Label>
            <Input
              id="deal-source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              disabled={create.isPending}
            />
            <p className="text-xs text-muted-foreground">{t("board.create.sourceHint")}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="deal-company">{t("board.create.company")}</Label>
            <Select value={companyId} onValueChange={setCompanyId} disabled={create.isPending}>
              <SelectTrigger id="deal-company">
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
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={create.isPending}>
              {t("board.create.cancel")}
            </Button>
            <Button type="submit" disabled={create.isPending || !title.trim()}>
              {create.isPending ? t("board.create.submitting") : t("board.create.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
