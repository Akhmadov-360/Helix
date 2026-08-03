import { LogOut } from "lucide-react";
import {
  Avatar,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@helix/ui";
import { useLogout, useMe } from "../../shared/auth/session";
import { useT } from "../../shared/i18n";

export function UserMenu() {
  const t = useT();
  const me = useMe();
  const logout = useLogout();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left transition-colors duration-150 hover:bg-sidebar-accent active:scale-[0.98]"
        >
          <Avatar name={me.name} size="sm" />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium text-sidebar-foreground">{me.name}</span>
            <span className="truncate text-xs text-sidebar-foreground/50">{t(`role.${me.role}`)}</span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>{me.name}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => logout.mutate()}
          disabled={logout.isPending}
          className="text-destructive focus:bg-destructive/10"
        >
          <LogOut className="h-4 w-4" />
          {t("shell.logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
