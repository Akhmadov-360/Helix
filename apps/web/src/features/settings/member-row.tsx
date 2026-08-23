import { LogOut, MoreHorizontal, UserMinus } from "lucide-react";
import { canManageMember, type OrgMemberResponse, type Role } from "@helix/api-schemas";
import {
  Avatar,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  RoleBadge,
} from "@helix/ui";
import { useT } from "../../shared/i18n";
import { RolePopover } from "./role-popover";

export interface MemberRowProps {
  member: OrgMemberResponse;
  actorRole: Role;
  isSelf: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  onChangeRole: (role: Role) => void;
  onRemove: () => void;
  changeRolePending: boolean;
}

// Row = avatar + name/email stack + role (interactive или static) + kebab. Правила видимости
// действий совпадают с сервером (OrganizationsService.changeMemberRole / removeMember):
// - Смена роли: строго младший + isSelf-ветка только для OWNER
// - Удаление: строго младший + isSelf-ветка для любой роли (leave org)
// Смена роли не дублируется в kebab — сам badge является affordance'ом (ChevronDown-подсказка);
// kebab держит только destructive-удаление, где отдельная визуальная кнопка была бы слишком
// заметной. Скрываем пункты меню которые актор не может выполнить (не disabled) — иначе UI
// обещает то, что сервер сразу отклонит.
export function MemberRow({
  member,
  actorRole,
  isSelf,
  canUpdate,
  canDelete,
  onChangeRole,
  onRemove,
  changeRolePending,
}: MemberRowProps) {
  const t = useT();
  const mayChangeRole = canUpdate && (isSelf ? actorRole === "OWNER" : canManageMember(actorRole, member.role));
  const mayRemove = canDelete && (isSelf || canManageMember(actorRole, member.role));

  return (
    <div className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 px-5 py-2.5 transition-colors hover:bg-muted/40 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={member.name} size="default" className="shrink-0" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {member.name}
            {isSelf && (
              <span className="ml-1.5 align-middle text-xs font-normal text-muted-foreground">
                {t("settings.members.you")}
              </span>
            )}
          </p>
          <p className="truncate text-xs text-muted-foreground">{member.email}</p>
        </div>
      </div>

      <div className="flex items-center">
        {mayChangeRole ? (
          <RolePopover
            current={member.role}
            actorRole={actorRole}
            personName={isSelf ? t("settings.members.rolePopover.yourself") : member.name}
            disabled={changeRolePending}
            onSelect={(role) => role !== member.role && onChangeRole(role)}
          />
        ) : (
          <RoleBadge role={member.role} label={t(`role.${member.role}`)} />
        )}
      </div>

      <div className="flex justify-end">
        {mayRemove ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[state=open]:bg-muted"
              aria-label={t("settings.members.list.actionsFor", { name: member.name })}
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                onSelect={onRemove}
                className="text-destructive focus:bg-destructive/10 focus:text-destructive"
              >
                {isSelf ? (
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <UserMinus className="h-4 w-4" aria-hidden="true" />
                )}
                {isSelf ? t("settings.members.list.leaveOrg") : t("settings.members.list.removeMember")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </div>
  );
}
