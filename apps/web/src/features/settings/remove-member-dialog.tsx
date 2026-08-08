import type { OrgMemberResponse } from "@helix/api-schemas";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@helix/ui";
import { useT } from "../../shared/i18n";
import { useRemoveMember } from "./mutations";

export function RemoveMemberDialog({
  orgId,
  member,
  open,
  onOpenChange,
}: {
  orgId: string;
  member: OrgMemberResponse | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const remove = useRemoveMember(orgId);

  function handleConfirm() {
    if (!member) return;
    remove.mutate({ userId: member.userId }, { onSuccess: () => onOpenChange(false) });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("settings.members.remove.title")}</DialogTitle>
          <DialogDescription>
            {member ? t("settings.members.remove.description", { name: member.name }) : null}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={remove.isPending}>
            {t("workspaces.create.cancel")}
          </Button>
          <Button type="button" variant="destructive" onClick={handleConfirm} disabled={remove.isPending}>
            {remove.isPending ? t("settings.members.remove.removing") : t("settings.members.remove.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
