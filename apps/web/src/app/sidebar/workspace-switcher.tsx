import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronsUpDown, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@helix/ui";
import { useCan } from "../../shared/auth/ability";
import { useT } from "../../shared/i18n";
import { setLastWorkspaceId } from "../../shared/lib/last-workspace";
import { CreateWorkspaceDialog } from "../../features/workspaces/create-workspace-dialog";
import { workspacesQueryOptions } from "../../features/workspaces/queries";

export function WorkspaceSwitcher({ orgId, currentWorkspaceId }: { orgId: string; currentWorkspaceId?: string }) {
  const t = useT();
  const workspaces = useQuery(workspacesQueryOptions(orgId)).data ?? [];
  const current = workspaces.find((w) => w.id === currentWorkspaceId);
  const canCreate = useCan("Workspace.create");
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium hover:bg-muted"
          >
            <span className="truncate">{current?.name ?? t("workspaces.title")}</span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>{t("workspaces.title")}</DropdownMenuLabel>
          {workspaces.map((workspace) => (
            <DropdownMenuItem key={workspace.id} asChild>
              <Link
                to="/workspaces/$workspaceId/board"
                params={{ workspaceId: workspace.id }}
                onClick={() => setLastWorkspaceId(workspace.id)}
              >
                {workspace.name}
              </Link>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/workspaces">{t("sidebar.allWorkspaces")}</Link>
          </DropdownMenuItem>
          {canCreate && (
            <DropdownMenuItem onSelect={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              {t("workspaces.create.trigger")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {canCreate && <CreateWorkspaceDialog orgId={orgId} open={createOpen} onOpenChange={setCreateOpen} />}
    </>
  );
}
