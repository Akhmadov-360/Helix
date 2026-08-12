import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, Input, Label } from "@helix/ui";
import { useT } from "../../shared/i18n";
import { useCreatePage } from "./mutations";

// Только title — content стартует пустым, редактируется сразу на странице деталей после
// создания (одно текстовое поле для быстрого старта, тот же приём, что quick-add задачи).
export function CreatePageDialog({
  orgId,
  projectId,
  open,
  onOpenChange,
}: {
  orgId: string;
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const navigate = useNavigate();
  const create = useCreatePage(orgId, projectId);
  const [title, setTitle] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    create.mutate(
      { title: title.trim() },
      {
        onSuccess: (page) => {
          setTitle("");
          onOpenChange(false);
          void navigate({ to: "/pages/$pageId", params: { pageId: page.id } });
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("pages.create.title")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="page-title" required>
              {t("pages.create.label")}
            </Label>
            <Input
              id="page-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={create.isPending}
              autoFocus
              required
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={create.isPending}>
              {t("pages.create.cancel")}
            </Button>
            <Button type="submit" disabled={create.isPending || !title.trim()}>
              {create.isPending ? t("pages.create.submitting") : t("pages.create.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
