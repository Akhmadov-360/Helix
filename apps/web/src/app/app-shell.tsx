import { Outlet } from "@tanstack/react-router";
import { Sidebar } from "./sidebar/sidebar";
import { useMe } from "../shared/auth/session";
import { Toaster } from "../shared/toast/toaster";

// Persistent layout (§8.3): оборачивает _authenticated, не ремоунтится на навигации между роутами.
// Редизайн этап 1: сайдбар вместо header-only shell — единственная точка навигации становится
// достаточной (раньше /settings/phases и /workspaces были физически недостижимы без URL).
export function AppShell() {
  const me = useMe();

  return (
    <div className="flex min-h-dvh">
      <Sidebar orgId={me.activeOrgId} />
      <main className="min-w-0 flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
      <Toaster />
    </div>
  );
}
