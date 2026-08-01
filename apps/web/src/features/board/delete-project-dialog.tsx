import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@helix/ui";
import { useT } from "../../shared/i18n";
import { useDeleteProject } from "./mutations";

export function DeleteProjectDialog({
  orgId,
  workspaceId,
  project,
  open,
  onOpenChange,
}: {
  orgId: string;
  workspaceId: string;
  project: { id: string; title: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const del = useDeleteProject(orgId, workspaceId);

  function handleConfirm() {
    if (!project) return;
    del.mutate({ id: project.id, title: project.title }, { onSuccess: () => onOpenChange(false) });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("board.card.deleteTitle")}</DialogTitle>
          <DialogDescription>
            {project ? t("board.card.deleteDescription", { title: project.title }) : null}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={del.isPending}>
            {t("phases.form.cancel")}
          </Button>
          <Button type="button" variant="destructive" onClick={handleConfirm} disabled={del.isPending}>
            {del.isPending ? t("board.card.deleting") : t("board.card.deleteSubmit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
