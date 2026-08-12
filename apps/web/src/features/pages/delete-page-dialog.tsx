import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@helix/ui";
import { useT } from "../../shared/i18n";
import { useDeletePage } from "./mutations";

export function DeletePageDialog({
  orgId,
  projectId,
  page,
  open,
  onOpenChange,
  onDeleted,
}: {
  orgId: string;
  projectId: string;
  page: { id: string; title: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}) {
  const t = useT();
  const del = useDeletePage(orgId, projectId);

  function handleConfirm() {
    if (!page) return;
    del.mutate(
      { pageId: page.id },
      {
        onSuccess: () => {
          onOpenChange(false);
          onDeleted?.();
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("pages.delete.title")}</DialogTitle>
          <DialogDescription>{page ? t("pages.delete.description", { title: page.title }) : null}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={del.isPending}>
            {t("pages.delete.cancel")}
          </Button>
          <Button type="button" variant="destructive" onClick={handleConfirm} disabled={del.isPending}>
            {del.isPending ? t("pages.delete.deleting") : t("pages.delete.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
