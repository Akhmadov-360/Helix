import { useMemo, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { LogOut, MoreHorizontal, Plus, UserMinus, Users } from "lucide-react";
import {
  canManageMember,
  type OrgMemberDetailedResponse,
  type Role,
} from "@helix/api-schemas";
import {
  Avatar,
  Button,
  DataTable,
  type DataTableColumn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  RoleBadge,
} from "@helix/ui";
import { useCan } from "../../shared/auth/ability";
import { useMe } from "../../shared/auth/session";
import { useT } from "../../shared/i18n";
import { useChangeMemberRole } from "./mutations";
import { orgMembersDetailedQueryOptions } from "./queries";
import { InviteMemberDialog } from "./invite-member-dialog";
import { PendingInvitesSection } from "./pending-invites-section";
import { RemoveMemberDialog } from "./remove-member-dialog";
import { RolePopover } from "./role-popover";

// Appendix B «Manage members & roles» = O/A only — canUpdate/canDelete гейтят элементы
// управления, но сервер (@CheckPolicy("update"/"delete", "Membership")) — единственный энфорсер.
export function MembersPage({ orgId }: { orgId: string }) {
  const t = useT();
  const me = useMe();
  const members = useSuspenseQuery(orgMembersDetailedQueryOptions(orgId)).data;
  const canUpdate = useCan("Membership.update");
  const canDelete = useCan("Membership.delete");
  const changeRole = useChangeMemberRole(orgId);
  const canInvite = useCan("Invite.create");
  const canReadInvites = useCan("Invite.read");
  const [removeTarget, setRemoveTarget] = useState<OrgMemberDetailedResponse | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [search, setSearch] = useState("");

  const columns = useMemo<DataTableColumn<OrgMemberDetailedResponse>[]>(
    () => [
      {
        key: "person",
        header: t("settings.members.column.person"),
        cell: (m) => <PersonCell member={m} isSelf={m.userId === me.id} youLabel={t("settings.members.you")} />,
      },
      {
        key: "role",
        header: t("settings.members.column.role"),
        className: "w-44",
        cell: (m) => (
          <RoleCell
            member={m}
            actorRole={me.role}
            isSelf={m.userId === me.id}
            canUpdate={canUpdate}
            changeRolePending={changeRole.isPending}
            onChangeRole={(role) => changeRole.mutate({ userId: m.userId, role })}
          />
        ),
      },
      {
        key: "leads",
        header: t("settings.members.column.leads"),
        className: "w-24 text-right",
        cell: (m) => <span className="tabular-nums text-foreground">{m.assignedLeadsCount}</span>,
      },
      {
        key: "tasks",
        header: t("settings.members.column.tasks"),
        className: "w-24 text-right",
        cell: (m) => <span className="tabular-nums text-foreground">{m.openTasksCount}</span>,
      },
    ],
    [t, me.id, me.role, canUpdate, changeRole],
  );

  const matches = (m: OrgMemberDetailedResponse, q: string) => {
    const needle = q.toLowerCase();
    return m.name.toLowerCase().includes(needle) || m.email.toLowerCase().includes(needle);
  };

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {t("settings.members.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("settings.members.subtitle")}</p>
        </div>
      </header>

      <DataTable
        columns={columns}
        data={members}
        getRowKey={(m) => m.userId}
        ariaLabel={t("settings.members.title")}
        title={
          <span className="flex items-center gap-2">
            {t("settings.members.title")}
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted px-1.5 text-xs font-semibold tabular-nums text-muted-foreground">
              {members.length}
            </span>
          </span>
        }
        actions={
          canInvite && (
            <Button type="button" onClick={() => setInviteOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t("settings.members.invite.trigger")}
            </Button>
          )
        }
        search={{
          value: search,
          onChange: setSearch,
          placeholder: t("settings.members.searchPlaceholder"),
          matches,
        }}
        rowActions={(m) => (
          <MemberActions
            member={m}
            actorRole={me.role}
            isSelf={m.userId === me.id}
            canDelete={canDelete}
            onRemove={() => setRemoveTarget(m)}
          />
        )}
        emptyState={
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-muted text-muted-foreground">
              <Users className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                {search.trim() ? t("settings.members.noResultsTitle") : t("settings.members.emptyTitle")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {search.trim() ? t("settings.members.noResultsBody") : t("settings.members.emptyBody")}
              </p>
            </div>
            {!search.trim() && canInvite && (
              <Button type="button" className="mt-2" onClick={() => setInviteOpen(true)}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t("settings.members.invite.trigger")}
              </Button>
            )}
          </div>
        }
        pagination={{
          initialPageSize: 25,
          labels: {
            pageSizeLabel: t("table.pagination.rowsPerPage"),
            pageLabel: (p) => t("table.pagination.page", { page: String(p) }),
            prevLabel: t("table.pagination.prevPage"),
            nextLabel: t("table.pagination.nextPage"),
          },
        }}
      />

      {canReadInvites && <PendingInvitesSection orgId={orgId} />}

      <RemoveMemberDialog
        orgId={orgId}
        member={removeTarget}
        isSelf={removeTarget?.userId === me.id}
        open={removeTarget !== null}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
      />
      <InviteMemberDialog orgId={orgId} actorRole={me.role} open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  );
}

// ── Cell components ─────────────────────────────────────────────────────────

function PersonCell({
  member,
  isSelf,
  youLabel,
}: {
  member: OrgMemberDetailedResponse;
  isSelf: boolean;
  youLabel: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar name={member.name} size="default" className="shrink-0" />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">
          {member.name}
          {isSelf && (
            <span className="ml-1.5 align-middle text-xs font-normal text-muted-foreground">{youLabel}</span>
          )}
        </p>
        <p className="truncate text-xs text-muted-foreground">{member.email}</p>
      </div>
    </div>
  );
}

function RoleCell({
  member,
  actorRole,
  isSelf,
  canUpdate,
  changeRolePending,
  onChangeRole,
}: {
  member: OrgMemberDetailedResponse;
  actorRole: Role;
  isSelf: boolean;
  canUpdate: boolean;
  changeRolePending: boolean;
  onChangeRole: (role: Role) => void;
}) {
  const t = useT();
  // Смена роли: строго младший + isSelf-ветка только для OWNER (совпадает с
  // OrganizationsService.changeMemberRole). Иначе — static badge.
  const mayChangeRole = canUpdate && (isSelf ? actorRole === "OWNER" : canManageMember(actorRole, member.role));
  if (mayChangeRole) {
    return (
      <RolePopover
        current={member.role}
        actorRole={actorRole}
        personName={isSelf ? t("settings.members.rolePopover.yourself") : member.name}
        disabled={changeRolePending}
        onSelect={(role) => role !== member.role && onChangeRole(role)}
      />
    );
  }
  return <RoleBadge role={member.role} label={t(`role.${member.role}`)} />;
}

function MemberActions({
  member,
  actorRole,
  isSelf,
  canDelete,
  onRemove,
}: {
  member: OrgMemberDetailedResponse;
  actorRole: Role;
  isSelf: boolean;
  canDelete: boolean;
  onRemove: () => void;
}) {
  const t = useT();
  // Удаление: строго младший + isSelf-ветка для любой роли (leave org).
  const mayRemove = canDelete && (isSelf || canManageMember(actorRole, member.role));
  if (!mayRemove) return null;
  return (
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
  );
}
