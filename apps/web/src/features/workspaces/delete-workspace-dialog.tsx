import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@helix/ui";
import { useT } from "../../shared/i18n";
import { useDeleteWorkspace } from "./mutations";

export function DeleteWorkspaceDialog({
  orgId,
  workspace,
  open,
  onOpenChange,
}: {
  orgId: string;
  workspace: { id: string; name: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const del = useDeleteWorkspace(orgId);

  function handleConfirm() {
    if (!workspace) return;
    del.mutate({ id: workspace.id, name: workspace.name }, { onSuccess: () => onOpenChange(false) });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("workspaces.delete.title")}</DialogTitle>
          <DialogDescription>
            {workspace ? t("workspaces.delete.description", { name: workspace.name }) : null}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={del.isPending}>
            {t("workspaces.create.cancel")}
          </Button>
          <Button type="button" variant="destructive" onClick={handleConfirm} disabled={del.isPending}>
            {del.isPending ? t("workspaces.delete.deleting") : t("workspaces.delete.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
