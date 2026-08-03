import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronRight, LayoutGrid, Plus } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger, cn } from "@helix/ui";
import { useCan } from "../../shared/auth/ability";
import { useT } from "../../shared/i18n";
import { setLastWorkspaceId } from "../../shared/lib/last-workspace";
import { CreateWorkspaceDialog } from "../../features/workspaces/create-workspace-dialog";
import { workspacesQueryOptions } from "../../features/workspaces/queries";

// Редизайн этап 3: то, что раньше было header-dropdown'ом (WorkspaceSwitcher), теперь —
// collapsible-секция в теле сайдбара, а не всплывающее меню: "Доска"/"Контакты"/"Компании"
// заняли место постоянного верхнего списка (nav-item.tsx, sidebar.tsx), воркспейсы ушли сюда.
//
// Максимум 3 строки — "все" всегда доступны через /workspaces. Настоящей "недавние/закреплённые"
// сортировки нет (нет поля last-accessed в домене) — порядок как вернул API; заводить отдельный
// трекинг ради витрины на 3 строки было бы преждевременно (M1).
const LIST_LIMIT = 3;

export function WorkspacesSection({ orgId, currentWorkspaceId }: { orgId: string; currentWorkspaceId?: string }) {
  const t = useT();
  const workspaces = useQuery(workspacesQueryOptions(orgId)).data ?? [];
  const canCreate = useCan("Workspace.create");
  const [createOpen, setCreateOpen] = useState(false);
  const [open, setOpen] = useState(true);

  return (
    <>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="group flex w-full items-center gap-1 rounded px-1 py-1 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50 transition-colors duration-150 hover:text-sidebar-foreground/80">
          <ChevronRight className="h-3 w-3 shrink-0 transition-transform duration-150 group-data-[state=open]:rotate-90" />
          <span className="truncate">{t("sidebar.workspaces.header")}</span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="ml-3.5 mt-1 space-y-1 border-l border-sidebar-border/60 pl-3">
            {workspaces.slice(0, LIST_LIMIT).map((workspace) => (
              <Link
                key={workspace.id}
                to="/workspaces/$workspaceId/board"
                params={{ workspaceId: workspace.id }}
                onClick={() => setLastWorkspaceId(workspace.id)}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground/70 transition-colors duration-150",
                  "hover:bg-sidebar-accent/60 hover:text-sidebar-foreground active:scale-[0.98]",
                  workspace.id === currentWorkspaceId && "bg-sidebar-accent/60 text-sidebar-foreground",
                )}
              >
                <LayoutGrid className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{workspace.name}</span>
              </Link>
            ))}
            <Link
              to="/workspaces"
              className="block rounded-md px-2 py-1.5 text-sm text-sidebar-foreground/70 transition-colors duration-150 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground active:scale-[0.98]"
            >
              {t("sidebar.allWorkspaces")}
            </Link>
            {canCreate && (
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium text-indigo-400 transition-colors duration-150 hover:text-indigo-300 active:scale-[0.98]"
              >
                <Plus className="h-3.5 w-3.5" />
                {t("workspaces.create.trigger")}
              </button>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
      {canCreate && <CreateWorkspaceDialog orgId={orgId} open={createOpen} onOpenChange={setCreateOpen} />}
    </>
  );
}
