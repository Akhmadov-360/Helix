import { useCallback, useMemo, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { LogOut, MailWarning, MoreHorizontal, Plus, UserMinus, Users } from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  canManageMember,
  type OrgMemberDetailedResponse,
  type Role,
} from "@helix/api-schemas";
import {
  Avatar,
  Button,
  buttonVariants,
  cn,
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
import { orgInvitesQueryOptions, orgMembersDetailedQueryOptions } from "./queries";
import { InviteMemberDialog } from "./invite-member-dialog";
import {
  initialMembersFilter,
  isMembersFilterActive,
  type MembersFilterState,
} from "./members-filter-state";
import { MembersFilterChips } from "./members-filters";
import { RemoveMemberDialog } from "./remove-member-dialog";
import { RolePopover } from "./role-popover";

// Appendix B «Manage members & roles» = O/A only — canUpdate/canDelete гейтят элементы
// управления, но сервер (@CheckPolicy("update"/"delete", "Membership")) — единственный энфорсер.
// Layout: h-full flex-col — DataTable внутри занимает всю доступную вертикаль (табличная карточка
// как «полотно»), пагинация всегда прибита к низу, sticky <thead> при скролле.
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
  const [filters, setFilters] = useState<MembersFilterState>(initialMembersFilter);

  const filterMatches = useCallback(
    (m: OrgMemberDetailedResponse) => {
      if (filters.roles.size > 0 && !filters.roles.has(m.role)) return false;
      if (filters.minLeads !== null && m.assignedLeadsCount < filters.minLeads) return false;
      if (filters.minTasks !== null && m.openTasksCount < filters.minTasks) return false;
      return true;
    },
    [filters],
  );

  const columns = useMemo<DataTableColumn<OrgMemberDetailedResponse>[]>(
    () => [
      {
        key: "person",
        header: t("settings.members.column.person"),
        hideable: false,
        cell: (m) => <PersonCell member={m} isSelf={m.userId === me.id} youLabel={t("settings.members.you")} />,
      },
      {
        key: "role",
        header: t("settings.members.column.role"),
        className: "w-44",
        hideable: false,
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
        className: "w-32 text-right",
        cell: (m) => <span className="tabular-nums text-foreground">{m.assignedLeadsCount}</span>,
      },
      {
        key: "tasks",
        header: t("settings.members.column.tasks"),
        className: "w-32 text-right",
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
    <div className="flex h-full min-h-0 flex-col">
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
          <>
            {canReadInvites && <PendingInvitesLink orgId={orgId} />}
            {canInvite && (
              <Button type="button" onClick={() => setInviteOpen(true)}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t("settings.members.invite.trigger")}
              </Button>
            )}
          </>
        }
        search={{
          value: search,
          onChange: setSearch,
          placeholder: t("settings.members.searchPlaceholder"),
          matches,
        }}
        filterChips={<MembersFilterChips state={filters} onChange={setFilters} />}
        filterMatches={filterMatches}
        controlLabels={{
          fields: t("dataTable.fields"),
          rowHeight: t("dataTable.rowHeight"),
          rowHeightCompact: t("dataTable.rowHeight.compact"),
          rowHeightComfortable: t("dataTable.rowHeight.comfortable"),
          rowHeightSpacious: t("dataTable.rowHeight.spacious"),
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
                {search.trim() || isMembersFilterActive(filters)
                  ? t("settings.members.noResultsTitle")
                  : t("settings.members.emptyTitle")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {search.trim() || isMembersFilterActive(filters)
                  ? t("settings.members.noResultsBody")
                  : t("settings.members.emptyBody")}
              </p>
            </div>
            {!search.trim() && !isMembersFilterActive(filters) && canInvite && (
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
            perPageLabel: (size) => t("dataTable.perPage", { size: String(size) }),
            prevLabel: t("table.pagination.prevPage"),
            nextLabel: t("dataTable.next"),
            pageAriaLabel: (p) => t("table.pagination.page", { page: String(p) }),
          },
        }}
      />

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

function PendingInvitesLink({ orgId }: { orgId: string }) {
  const t = useT();
  // useSuspenseQuery — прогретый кэш через loader, никакого loading state; счётчик рендерится
  // сразу при заходе на Members.
  const invites = useSuspenseQuery(orgInvitesQueryOptions(orgId)).data;
  // Наш Button не поддерживает asChild (без Radix Slot), поэтому Link стилизуем через
  // buttonVariants — точный визуальный клон Button variant="outline".
  return (
    <Link to="/settings/pending-invites" className={cn(buttonVariants({ variant: "outline" }))}>
      <MailWarning className="h-4 w-4" aria-hidden="true" />
      {t("settings.members.pendingInvitesLink", { count: String(invites.length) })}
    </Link>
  );
}

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
