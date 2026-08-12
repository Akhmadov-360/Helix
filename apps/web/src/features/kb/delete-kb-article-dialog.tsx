import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@helix/ui";
import { useT } from "../../shared/i18n";
import { useDeleteKbArticle } from "./mutations";

export function DeleteKbArticleDialog({
  orgId,
  article,
  open,
  onOpenChange,
  onDeleted,
}: {
  orgId: string;
  article: { id: string; title: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}) {
  const t = useT();
  const del = useDeleteKbArticle(orgId);

  function handleConfirm() {
    if (!article) return;
    del.mutate(
      { articleId: article.id },
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
          <DialogTitle>{t("kb.delete.title")}</DialogTitle>
          <DialogDescription>{article ? t("kb.delete.description", { title: article.title }) : null}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={del.isPending}>
            {t("kb.delete.cancel")}
          </Button>
          <Button type="button" variant="destructive" onClick={handleConfirm} disabled={del.isPending}>
            {del.isPending ? t("kb.delete.deleting") : t("kb.delete.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
