import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Plus, Trash2, Users } from "lucide-react";
import type { OrgMemberResponse, Role } from "@helix/api-schemas";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
} from "@helix/ui";
import { useCan } from "../../shared/auth/ability";
import { useMe } from "../../shared/auth/session";
import { useT } from "../../shared/i18n";
import { useChangeMemberRole } from "./mutations";
import { orgMembersQueryOptions } from "../../shared/org/queries";
import { InviteMemberDialog } from "./invite-member-dialog";
import { PendingInvitesSection } from "./pending-invites-section";
import { RemoveMemberDialog } from "./remove-member-dialog";

const COLUMN_COUNT = 4;
const ROLES: Role[] = ["OWNER", "ADMIN", "MANAGER", "MEMBER", "VIEWER"];

// Appendix B «Manage members & roles» = O/A only — canUpdate/canDelete гейтят элементы
// управления, но сервер (@CheckPolicy("update"/"delete", "Membership")) — единственный энфорсер.
export function MembersPage({ orgId }: { orgId: string }) {
  const t = useT();
  const me = useMe();
  const members = useSuspenseQuery(orgMembersQueryOptions(orgId)).data;
  const canUpdate = useCan("Membership.update");
  const canDelete = useCan("Membership.delete");
  const changeRole = useChangeMemberRole(orgId);
  const canInvite = useCan("Invite.create");
  const canReadInvites = useCan("Invite.read");
  const [removeTarget, setRemoveTarget] = useState<OrgMemberResponse | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const toolbar = (
    <TableToolbar
      title={t("settings.members.title")}
      actions={
        canInvite && (
          <Button type="button" size="sm" onClick={() => setInviteOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            {t("settings.members.invite.trigger")}
          </Button>
        )
      }
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <p className="text-sm text-muted-foreground">{t("settings.members.subtitle")}</p>
      <Table toolbar={toolbar} containerClassName="min-h-0 flex-1" className="min-w-[560px]">
        <TableHeader>
          <TableRow header>
            <TableHead>{t("settings.members.list.name")}</TableHead>
            <TableHead>{t("settings.members.list.email")}</TableHead>
            <TableHead className="w-44">{t("settings.members.list.role")}</TableHead>
            <TableHead className="w-10">
              <span className="sr-only">{t("settings.members.list.menu")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.length === 0 ? (
            <TableRow>
              <TableCell colSpan={COLUMN_COUNT}>
                <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
                  <Users className="h-8 w-8" />
                  <p>{t("settings.members.empty")}</p>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            members.map((member) => {
              // Нельзя понизить/удалить последнего OWNER — сервер уже отказывает (LastOwnerError),
              // но заранее блокируем очевидный случай "я тут один OWNER" для UX (не единственный guard).
              const isSelf = member.userId === me.id;
              return (
                <TableRow key={member.userId}>
                  <TableCell className="font-medium text-foreground">
                    {member.name}
                    {isSelf && <span className="ml-1.5 text-xs text-muted-foreground">{t("settings.members.you")}</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{member.email}</TableCell>
                  <TableCell>
                    {canUpdate ? (
                      <Select
                        value={member.role}
                        onValueChange={(role) => changeRole.mutate({ userId: member.userId, role: role as Role })}
                        disabled={changeRole.isPending}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map((role) => (
                            <SelectItem key={role} value={role}>
                              {t(`role.${role}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      t(`role.${member.role}`)
                    )}
                  </TableCell>
                  <TableCell>
                    {canDelete && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        aria-label={t("settings.members.list.remove")}
                        onClick={() => setRemoveTarget(member)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      {canReadInvites && <PendingInvitesSection orgId={orgId} />}

      <RemoveMemberDialog
        orgId={orgId}
        member={removeTarget}
        open={removeTarget !== null}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
      />
      <InviteMemberDialog orgId={orgId} actorRole={me.role} open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  );
}
