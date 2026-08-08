import { useSuspenseQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableToolbar } from "@helix/ui";
import { useCan } from "../../shared/auth/ability";
import { useT } from "../../shared/i18n";
import { useRevokeInvite } from "./mutations";
import { orgInvitesQueryOptions } from "./queries";

// Отдельная секция, не строки в таблице участников (§ решение): pending-инвайт — не Membership,
// у него другой набор действий (revoke, не смена роли/удаление) — смешение в одну таблицу
// путало бы, что вообще можно сделать со строкой.
export function PendingInvitesSection({ orgId }: { orgId: string }) {
  const t = useT();
  const invites = useSuspenseQuery(orgInvitesQueryOptions(orgId)).data;
  const canRevoke = useCan("Invite.delete");
  const revoke = useRevokeInvite(orgId);

  if (invites.length === 0) return null;

  return (
    <Table toolbar={<TableToolbar title={t("settings.members.pending.title")} />} className="min-w-[560px]">
      <TableHeader>
        <TableRow header>
          <TableHead>{t("settings.members.pending.list.email")}</TableHead>
          <TableHead className="w-32">{t("settings.members.pending.list.role")}</TableHead>
          <TableHead className="w-40">{t("settings.members.pending.list.invitedBy")}</TableHead>
          <TableHead className="w-10">
            <span className="sr-only">{t("settings.members.pending.list.revoke")}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invites.map((invite) => (
          <TableRow key={invite.id}>
            <TableCell className="font-medium text-foreground">{invite.email}</TableCell>
            <TableCell className="text-muted-foreground">{t(`role.${invite.role}`)}</TableCell>
            <TableCell className="text-muted-foreground">{invite.invitedByName}</TableCell>
            <TableCell>
              {canRevoke && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                  aria-label={t("settings.members.pending.list.revoke")}
                  disabled={revoke.isPending}
                  onClick={() => revoke.mutate({ id: invite.id })}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
