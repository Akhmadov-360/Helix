import { Link } from "@tanstack/react-router";
import type { ComponentType } from "react";
import { cn } from "@helix/ui";

type SidebarRoute = "/workspaces/$workspaceId/board" | "/contacts" | "/companies";

export function SidebarNavItem({
  to,
  params,
  icon: Icon,
  label,
}: {
  to: SidebarRoute;
  params?: { workspaceId: string };
  icon: ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <Link
      to={to}
      params={params}
      className={cn(
        "relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-sidebar-foreground/70 transition-colors duration-150",
        "before:absolute before:inset-y-1 before:left-0 before:w-[3px] before:rounded-full before:content-['']",
        "hover:bg-sidebar-accent/60 hover:text-sidebar-foreground active:scale-[0.98]",
      )}
      activeProps={{
        className: "bg-sidebar-accent text-sidebar-accent-foreground font-medium before:bg-primary",
      }}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </Link>
  );
}
