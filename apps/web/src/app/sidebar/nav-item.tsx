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
        "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors",
        "hover:bg-muted hover:text-foreground",
      )}
      activeProps={{ className: "bg-secondary font-medium text-foreground" }}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </Link>
  );
}
