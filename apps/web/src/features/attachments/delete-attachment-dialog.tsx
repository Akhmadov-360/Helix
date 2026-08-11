import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@helix/ui";
import { useT } from "../../shared/i18n";
import { useDeleteAttachment } from "./mutations";

export function DeleteAttachmentDialog({
  orgId,
  projectId,
  attachment,
  open,
  onOpenChange,
}: {
  orgId: string;
  projectId: string;
  attachment: { id: string; filename: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const del = useDeleteAttachment(orgId, projectId);

  function handleConfirm() {
    if (!attachment) return;
    del.mutate({ attachmentId: attachment.id }, { onSuccess: () => onOpenChange(false) });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("attachments.delete.title")}</DialogTitle>
          <DialogDescription>
            {attachment ? t("attachments.delete.description", { filename: attachment.filename }) : null}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={del.isPending}>
            {t("attachments.delete.cancel")}
          </Button>
          <Button type="button" variant="destructive" onClick={handleConfirm} disabled={del.isPending}>
            {del.isPending ? t("attachments.delete.deleting") : t("attachments.delete.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
