import type { OrgMemberResponse } from "@helix/api-schemas";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@helix/ui";
import { useT } from "../../shared/i18n";
import { useRemoveMember } from "./mutations";

export function RemoveMemberDialog({
  orgId,
  member,
  isSelf,
  open,
  onOpenChange,
}: {
  orgId: string;
  member: OrgMemberResponse | null;
  isSelf: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const remove = useRemoveMember(orgId);

  function handleConfirm() {
    if (!member) return;
    remove.mutate({ userId: member.userId }, { onSuccess: () => onOpenChange(false) });
  }

  // "Leave organization" — семантически другая операция (уход по собственной воле), не удаление.
  // Разный copy, разный CTA-лейбл; endpoint у бэкенда один (DELETE /members/:id), фронт различает
  // только UX-слоем.
  const title = isSelf
    ? t("settings.members.remove.leaveTitle")
    : member
      ? t("settings.members.remove.title", { name: member.name })
      : "";
  const description = isSelf
    ? t("settings.members.remove.leaveDescription")
    : member
      ? t("settings.members.remove.description", { name: member.name })
      : "";
  const submitLabel = isSelf ? t("settings.members.remove.leaveSubmit") : t("settings.members.remove.submit");
  const submittingLabel = isSelf ? t("settings.members.remove.leaving") : t("settings.members.remove.removing");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={remove.isPending}>
            {t("workspaces.create.cancel")}
          </Button>
          <Button type="button" variant="destructive" onClick={handleConfirm} disabled={remove.isPending}>
            {remove.isPending ? submittingLabel : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
