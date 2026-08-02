import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@helix/ui";
import { useT } from "../../shared/i18n";
import { useDeleteContact } from "./mutations";

export function DeleteContactDialog({
  orgId,
  contact,
  open,
  onOpenChange,
  onDeleted,
}: {
  orgId: string;
  contact: { id: string; name: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}) {
  const t = useT();
  const del = useDeleteContact(orgId);

  function handleConfirm() {
    if (!contact) return;
    del.mutate(
      { contactId: contact.id },
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
          <DialogTitle>{t("contacts.delete.title")}</DialogTitle>
          <DialogDescription>{contact ? t("contacts.delete.description", { name: contact.name }) : null}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={del.isPending}>
            {t("companies.form.cancel")}
          </Button>
          <Button type="button" variant="destructive" onClick={handleConfirm} disabled={del.isPending}>
            {del.isPending ? t("contacts.delete.deleting") : t("contacts.delete.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
