import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Plus, Users } from "lucide-react";
import type { OrgMemberResponse } from "@helix/api-schemas";
import { Button } from "@helix/ui";
import { useCan } from "../../shared/auth/ability";
import { useMe } from "../../shared/auth/session";
import { useT } from "../../shared/i18n";
import { useChangeMemberRole } from "./mutations";
import { orgMembersQueryOptions } from "../../shared/org/queries";
import { InviteMemberDialog } from "./invite-member-dialog";
import { MemberRow } from "./member-row";
import { PendingInvitesSection } from "./pending-invites-section";
import { RemoveMemberDialog } from "./remove-member-dialog";

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

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {t("settings.members.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("settings.members.subtitle")}</p>
        </div>
        {canInvite && (
          <Button type="button" onClick={() => setInviteOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("settings.members.invite.trigger")}
          </Button>
        )}
      </header>

      <section
        aria-label={t("settings.members.title")}
        className="overflow-hidden rounded-xl border border-border bg-card"
      >
        {members.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-muted text-muted-foreground">
              <Users className="h-5 w-5" aria-hidden="true" />
            </span>
            <h2 className="text-lg font-semibold text-foreground">{t("settings.members.emptyTitle")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("settings.members.emptyBody")}</p>
            {canInvite && (
              <Button type="button" className="mt-5" onClick={() => setInviteOpen(true)}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t("settings.members.invite.trigger")}
              </Button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {members.map((member) => (
              <MemberRow
                key={member.userId}
                member={member}
                actorRole={me.role}
                isSelf={member.userId === me.id}
                canUpdate={canUpdate}
                canDelete={canDelete}
                changeRolePending={changeRole.isPending}
                onChangeRole={(role) => changeRole.mutate({ userId: member.userId, role })}
                onRemove={() => setRemoveTarget(member)}
              />
            ))}
          </div>
        )}
      </section>

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
