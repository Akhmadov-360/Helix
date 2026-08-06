import { useParams } from "@tanstack/react-router";
import { Building2, KanbanSquare, ScrollText, Users, UsersRound } from "lucide-react";
import { useCan } from "../../shared/auth/ability";
import { LocaleSwitcher, useT } from "../../shared/i18n";
import { getLastWorkspaceId } from "../../shared/lib/last-workspace";
import { ThemeToggle } from "../../shared/theme";
import { SidebarNavItem } from "./nav-item";
import { OrgSwitcher } from "./org-switcher";
import { UserMenu } from "./user-menu";
import { WorkspacesSection } from "./workspaces-section";

// Постоянная навигация (веха редизайна). Board — единственный workspace-scoped раздел в сайдбаре:
// управление фазами переехало на саму доску (trailing "+ колонка", rename/delete через меню
// колонки) — отдельная страница /settings/phases удалена, дублировать функционал незачем.
//
// Контакты/Компании — org-scoped (не workspace-scoped): Contact/Company живут на уровне орги, не
// воркспейса (docs/decisions.md — "org-scoped SHARED resource"), поэтому не гейтятся на
// workspaceId и рендерятся рядом с "Доской" в ОДНОМ постоянном списке, а не внутри аккордеона —
// этап 3 редизайна: permanent-links отделены от collapsible workspaces-секции ниже.
export function Sidebar({ orgId }: { orgId: string }) {
  const t = useT();
  // useParams({strict:false}) реактивен на текущий матч роута — если на нём есть :workspaceId
  // (board), берём его; иначе (напр. /projects/:id/*, /workspaces) — последний открытый.
  const params = useParams({ strict: false }) as { workspaceId?: string };
  const workspaceId = params.workspaceId ?? getLastWorkspaceId() ?? undefined;

  // Appendix B «Manage members & roles» / D5 «org-security-аудит» — оба O/A only. Пункты скрыты
  // для остальных ролей (косметика, сервер — единственный энфорсер), а не просто задизейблены:
  // страница пустая для них ценности не несёт.
  const canUpdateMembers = useCan("Membership.update");
  const canDeleteMembers = useCan("Membership.delete");
  const canManageMembers = canUpdateMembers || canDeleteMembers;
  const canReadAuditLog = useCan("AuditLog.read");

  return (
    <aside className="flex h-dvh w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className="border-b border-sidebar-border p-2">
        <OrgSwitcher activeOrgId={orgId} />
      </div>

      <nav className="scroll-slim flex flex-1 flex-col gap-3 overflow-y-auto p-2">
        <div className="flex flex-col gap-0.5">
          {workspaceId && (
            <SidebarNavItem
              to="/workspaces/$workspaceId/board"
              params={{ workspaceId }}
              icon={KanbanSquare}
              label={t("sidebar.nav.board")}
            />
          )}
          <SidebarNavItem to="/contacts" icon={Users} label={t("sidebar.nav.contacts")} />
          <SidebarNavItem to="/companies" icon={Building2} label={t("sidebar.nav.companies")} />
        </div>

        <WorkspacesSection orgId={orgId} currentWorkspaceId={workspaceId} />

        {(canManageMembers || canReadAuditLog) && (
          <div className="flex flex-col gap-0.5 border-t border-sidebar-border pt-3">
            {canManageMembers && (
              <SidebarNavItem to="/settings/members" icon={UsersRound} label={t("sidebar.nav.members")} />
            )}
            {canReadAuditLog && (
              <SidebarNavItem to="/settings/audit-log" icon={ScrollText} label={t("sidebar.nav.auditLog")} />
            )}
          </div>
        )}
      </nav>

      <div className="flex flex-col gap-1 border-t border-sidebar-border p-2">
        <UserMenu />
        <div className="flex items-center gap-1">
          <ThemeToggle className="text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground" />
          <LocaleSwitcher className="text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground" />
        </div>
      </div>
    </aside>
  );
}
