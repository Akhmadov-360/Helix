import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@helix/ui";
import { useLocalize } from "../../shared/lib/localize";
import { useT } from "../../shared/i18n";
import { useDeleteField } from "./mutations";
import type { FieldDefinitionResponse } from "@helix/api-schemas";

export function DeleteFieldDialog({
  orgId,
  workspaceId,
  field,
  open,
  onOpenChange,
}: {
  orgId: string;
  workspaceId: string;
  field: FieldDefinitionResponse | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const localize = useLocalize();
  const del = useDeleteField(orgId, workspaceId);

  function handleConfirm() {
    if (!field) return;
    del.mutate({ fieldId: field.id }, { onSuccess: () => onOpenChange(false) });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("fields.delete.title")}</DialogTitle>
          {/* §6: значения в уже созданных лидах НЕ удаляются — предупреждаем явно, чтобы поведение
              не выглядело как потеря данных. */}
          <DialogDescription>
            {field ? t("fields.delete.description", { label: localize(field.label) }) : null}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={del.isPending}>
            {t("fields.form.cancel")}
          </Button>
          <Button type="button" variant="destructive" onClick={handleConfirm} disabled={del.isPending}>
            {del.isPending ? t("fields.delete.submitting") : t("fields.delete.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
