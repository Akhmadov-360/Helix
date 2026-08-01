import { useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@helix/ui";
import { useT } from "../../shared/i18n";
import { useCreateProject } from "./mutations";

export function CreateDealDialog({
  orgId,
  workspaceId,
  open,
  onOpenChange,
}: {
  orgId: string;
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const create = useCreateProject(orgId, workspaceId);
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [source, setSource] = useState("");

  function reset() {
    setTitle("");
    setValue("");
    setCurrency("USD");
    setSource("");
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
            <Label htmlFor="deal-title">{t("board.create.name")}</Label>
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
            <div className="flex w-24 flex-col gap-1.5">
              <Label htmlFor="deal-currency">{t("board.create.currency")}</Label>
              <Input
                id="deal-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                disabled={create.isPending || !value.trim()}
                maxLength={3}
              />
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
