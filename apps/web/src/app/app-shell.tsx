import { Outlet } from "@tanstack/react-router";
import { Button } from "@helix/ui";
import { useLogout, useMe } from "../shared/auth/session";
import { useT } from "../shared/i18n";
import { Toaster } from "../shared/toast/toaster";

// Persistent layout (§8.3): оборачивает _authenticated, не ремоунтится на навигации между роутами.
export function AppShell() {
  const t = useT();
  const me = useMe();
  const logout = useLogout();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-14 items-center justify-between border-b border-border px-4">
        <span className="font-semibold">Helix</span>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {me.name} · {t(`role.${me.role}`)}
          </span>
          <Button variant="outline" size="sm" onClick={() => logout.mutate()} disabled={logout.isPending}>
            {t("shell.logout")}
          </Button>
        </div>
      </header>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
      <Toaster />
    </div>
  );
}
