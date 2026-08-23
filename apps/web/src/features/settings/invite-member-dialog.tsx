import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import type { Role } from "@helix/api-schemas";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
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
import { useT, type MessageKey } from "../../shared/i18n";
import { useCreateInvite } from "./mutations";
import { toInviteError } from "./settings-error";

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
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{t("settings.members.invite.title")}</DialogTitle>
          <DialogDescription>{t("settings.members.invite.subtitle")}</DialogDescription>
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

  // Успех закрывает диалог — держим onSuccess здесь, а не в mutations.ts (mutation переиспользуется
  // где-то ещё в будущем — с чужой логикой закрытия).
  useEffect(() => {
    if (create.isSuccess) onDone();
  }, [create.isSuccess, onDone]);

  const inlineErrorKey = pickInlineErrorKey(create.isError ? create.error : null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    create.mutate({ email: email.trim(), role });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {inlineErrorKey && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3.5 py-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{t(inlineErrorKey)}</span>
        </div>
      )}

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
        <p className="pt-0.5 text-xs leading-snug text-muted-foreground">{t(`role.${role}.desc`)}</p>
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

// Отдельная функция — тесно связана с mutations.ts (её onError скипает те же две ветки для тоста);
// синхронизация обеих сторон живёт рядом в /features/settings, чтобы разъезд между ними ловился
// глазами при ревью.
function pickInlineErrorKey(error: unknown): MessageKey | null {
  if (!error) return null;
  const kind = toInviteError(error);
  if (kind === "alreadyMember") return "settings.members.invite.error.alreadyMember";
  if (kind === "roleTooHigh") return "settings.members.invite.error.roleTooHigh";
  return null;
}
