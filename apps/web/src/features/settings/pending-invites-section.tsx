import { Mail, MoreHorizontal, Undo2 } from "lucide-react";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { InviteResponse } from "@helix/api-schemas";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  RoleBadge,
} from "@helix/ui";
import { useCan } from "../../shared/auth/ability";
import { useT } from "../../shared/i18n";
import { useLocaleStore } from "../../shared/i18n/store";
import { formatRelative } from "../../shared/lib/format-relative";
import { useRevokeInvite } from "./mutations";
import { orgInvitesQueryOptions } from "./queries";

// Отдельная секция, не строки в таблице участников (§ решение): pending-инвайт — не Membership,
// у него другой набор действий (revoke, не смена роли/удаление) — смешение в одну таблицу
// путало бы, что вообще можно сделать со строкой. Секция скрыта целиком при 0 инвайтов
// (не "empty state") — актор увидит блок только когда есть что revoke'нуть.
export function PendingInvitesSection({ orgId }: { orgId: string }) {
  const t = useT();
  const locale = useLocaleStore((state) => state.locale);
  const invites = useSuspenseQuery(orgInvitesQueryOptions(orgId)).data;
  const canRevoke = useCan("Invite.delete");
  const revoke = useRevokeInvite(orgId);
  const relativeFormatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  if (invites.length === 0) return null;

  return (
    <section aria-labelledby="pending-invites-title" className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <h2 id="pending-invites-title" className="text-lg font-semibold text-foreground">
          {t("settings.members.pending.title")}
        </h2>
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted px-1.5 text-xs font-semibold tabular-nums text-muted-foreground">
          {invites.length}
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <ul className="divide-y divide-border">
          {invites.map((invite) => (
            <PendingRow
              key={invite.id}
              invite={invite}
              canRevoke={canRevoke}
              revokePending={revoke.isPending}
              relativeTime={formatRelative(invite.createdAt, relativeFormatter)}
              onRevoke={() => revoke.mutate({ id: invite.id })}
            />
          ))}
        </ul>
      </div>
    </section>
  );
}

interface PendingRowProps {
  invite: InviteResponse;
  canRevoke: boolean;
  revokePending: boolean;
  relativeTime: string;
  onRevoke: () => void;
}

function PendingRow({ invite, canRevoke, revokePending, relativeTime, onRevoke }: PendingRowProps) {
  const t = useT();
  return (
    <li className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 border-l-2 border-l-dashed border-l-border px-5 py-2.5 transition-colors hover:bg-muted/40 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-dashed border-border bg-muted text-muted-foreground"
          aria-hidden="true"
        >
          <Mail className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{invite.email}</p>
          <p className="truncate text-xs text-muted-foreground">
            {t("settings.members.pending.subtitle", { inviter: invite.invitedByName, time: relativeTime })}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <RoleBadge role={invite.role} label={t(`role.${invite.role}`)} />
        <span className="inline-flex h-5 items-center rounded border border-dashed border-border px-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t("settings.members.pending.chip")}
        </span>
      </div>

      <div className="flex justify-end">
        {canRevoke && (
          <DropdownMenu>
            <DropdownMenuTrigger
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[state=open]:bg-muted disabled:opacity-50"
              disabled={revokePending}
              aria-label={t("settings.members.pending.actionsFor", { email: invite.email })}
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem
                onSelect={onRevoke}
                className="text-destructive focus:bg-destructive/10 focus:text-destructive"
              >
                <Undo2 className="h-4 w-4" aria-hidden="true" />
                {t("settings.members.pending.revokeAction")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </li>
  );
}
