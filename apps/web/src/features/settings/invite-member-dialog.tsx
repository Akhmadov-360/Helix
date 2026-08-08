import { useState } from "react";
import type { Role } from "@helix/api-schemas";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@helix/ui";
import { useT } from "../../shared/i18n";
import { useCreateInvite } from "./mutations";

const ROLES: Role[] = ["OWNER", "ADMIN", "MANAGER", "MEMBER", "VIEWER"];
// Косметическое зеркало core/authz/role-hierarchy.ts (сервер — единственный энфорсер, §4
// invites.md): не даём выбрать роль выше своей, чтобы не ловить 400 после сабмита.
const ROLE_RANK: Record<Role, number> = { VIEWER: 0, MEMBER: 1, MANAGER: 2, ADMIN: 3, OWNER: 4 };

export function InviteMemberDialog({
  orgId,
  actorRole,
  open,
  onOpenChange,
}: {
  orgId: string;
  actorRole: Role;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("settings.members.invite.title")}</DialogTitle>
        </DialogHeader>
        {/* key сбрасывает форму при каждом открытии — тот же приём, что CompanyFormDialog. */}
        {open && <InviteFormFields key={orgId} orgId={orgId} actorRole={actorRole} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function InviteFormFields({
  orgId,
  actorRole,
  onDone,
}: {
  orgId: string;
  actorRole: Role;
  onDone: () => void;
}) {
  const t = useT();
  const create = useCreateInvite(orgId);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("MEMBER");
  const availableRoles = ROLES.filter((r) => ROLE_RANK[r] <= ROLE_RANK[actorRole]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    create.mutate({ email: email.trim(), role }, { onSuccess: onDone });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invite-email" required>
          {t("settings.members.invite.email")}
        </Label>
        <Input
          id="invite-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={create.isPending}
          autoFocus
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invite-role" required>
          {t("settings.members.invite.role")}
        </Label>
        <Select value={role} onValueChange={(v) => setRole(v as Role)} disabled={create.isPending}>
          <SelectTrigger id="invite-role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {availableRoles.map((r) => (
              <SelectItem key={r} value={r}>
                {t(`role.${r}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone} disabled={create.isPending}>
          {t("companies.form.cancel")}
        </Button>
        <Button type="submit" disabled={create.isPending || !email.trim()}>
          {create.isPending ? t("settings.members.invite.submitting") : t("settings.members.invite.submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}
