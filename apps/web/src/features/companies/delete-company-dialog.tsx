import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@helix/ui";
import { useT } from "../../shared/i18n";
import { useDeleteCompany } from "./mutations";

export function DeleteCompanyDialog({
  orgId,
  company,
  open,
  onOpenChange,
  onDeleted,
}: {
  orgId: string;
  company: { id: string; name: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}) {
  const t = useT();
  const del = useDeleteCompany(orgId);

  function handleConfirm() {
    if (!company) return;
    del.mutate(
      { companyId: company.id },
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
          <DialogTitle>{t("companies.delete.title")}</DialogTitle>
          <DialogDescription>{company ? t("companies.delete.description", { name: company.name }) : null}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={del.isPending}>
            {t("companies.form.cancel")}
          </Button>
          <Button type="button" variant="destructive" onClick={handleConfirm} disabled={del.isPending}>
            {del.isPending ? t("companies.delete.deleting") : t("companies.delete.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
