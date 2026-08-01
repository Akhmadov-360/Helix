import { useParams } from "@tanstack/react-router";
import { KanbanSquare } from "lucide-react";
import { LocaleSwitcher, useT } from "../../shared/i18n";
import { getLastWorkspaceId } from "../../shared/lib/last-workspace";
import { ThemeToggle } from "../../shared/theme";
import { SidebarNavItem } from "./nav-item";
import { UserMenu } from "./user-menu";
import { WorkspaceSwitcher } from "./workspace-switcher";

// Постоянная навигация (веха редизайна, этап 1) — заменяет header-only AppShell. Board —
// единственный workspace-scoped раздел в сайдбаре: управление фазами переехало на саму доску
// (trailing "+ колонка", rename/delete через меню колонки) — отдельная страница /settings/phases
// удалена, дублировать один и тот же функционал в двух местах незачем.
export function Sidebar({ orgId }: { orgId: string }) {
  const t = useT();
  // useParams({strict:false}) реактивен на текущий матч роута — если на нём есть :workspaceId
  // (board), берём его; иначе (напр. /projects/:id/*, /workspaces) — последний открытый.
  const params = useParams({ strict: false }) as { workspaceId?: string };
  const workspaceId = params.workspaceId ?? getLastWorkspaceId() ?? undefined;

  return (
    <aside className="flex h-dvh w-64 shrink-0 flex-col border-r border-border bg-card">
      <div className="flex h-14 items-center border-b border-border px-3">
        <span className="px-1.5 text-base font-semibold">Helix</span>
      </div>

      <div className="border-b border-border p-2">
        <WorkspaceSwitcher orgId={orgId} currentWorkspaceId={workspaceId} />
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
        {workspaceId && (
          <SidebarNavItem
            to="/workspaces/$workspaceId/board"
            params={{ workspaceId }}
            icon={KanbanSquare}
            label={t("sidebar.nav.board")}
          />
        )}
      </nav>

      <div className="flex flex-col gap-1 border-t border-border p-2">
        <UserMenu />
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <LocaleSwitcher />
        </div>
      </div>
    </aside>
  );
}
