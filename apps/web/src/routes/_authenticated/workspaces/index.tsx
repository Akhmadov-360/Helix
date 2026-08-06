import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowRight, Calendar, MoreHorizontal, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import type { WorkspaceResponse } from "@helix/api-schemas";
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@helix/ui";
import { workspacesQueryOptions } from "../../../features/workspaces/queries";
import { CreateWorkspaceDialog } from "../../../features/workspaces/create-workspace-dialog";
import { EditWorkspaceDialog } from "../../../features/workspaces/edit-workspace-dialog";
import { DeleteWorkspaceDialog } from "../../../features/workspaces/delete-workspace-dialog";
import { SaveAsBlueprintDialog } from "../../../features/workspaces/save-as-blueprint-dialog";
import { useCan } from "../../../shared/auth/ability";
import { useLocaleStore, useT } from "../../../shared/i18n";
import { meQueryOptions, useMe } from "../../../shared/auth/session";

export const Route = createFileRoute("/_authenticated/workspaces/")({
  loader: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions);
    await context.queryClient.ensureQueryData(workspacesQueryOptions(me.activeOrgId));
  },
  component: WorkspacesPage,
});

function workspaceInitial(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

function WorkspacesPage() {
  const t = useT();
  const me = useMe();
  const locale = useLocaleStore((state) => state.locale);
  const workspaces = useSuspenseQuery(workspacesQueryOptions(me.activeOrgId)).data;
  const canCreate = useCan("Workspace.create");
  const canUpdate = useCan("Workspace.update");
  const canDelete = useCan("Workspace.delete");
  const canSaveBlueprint = useCan("Blueprint.create"); // blueprints.md §6: Manage blueprints = O/A only
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<WorkspaceResponse | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [saveBlueprintTarget, setSaveBlueprintTarget] = useState<WorkspaceResponse | null>(null);

  const dateFormatter = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric" });

  return (
    <div className="flex flex-col">
      <div className="mb-6 border-b border-border pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("workspaces.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("workspaces.subtitle")}</p>
      </div>

      {workspaces.length === 0 && !canCreate ? (
        <p className="text-muted-foreground">{t("workspaces.empty")}</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {canCreate && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="group flex min-h-[140px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-border p-5 text-center transition-all duration-200 hover:border-indigo-500/80 hover:bg-indigo-500/5 active:scale-[0.98]"
            >
              <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors group-hover:bg-indigo-600/20 group-hover:text-indigo-400">
                <Plus className="h-5 w-5" />
              </span>
              <span className="text-sm font-medium text-muted-foreground group-hover:text-indigo-300">
                {t("workspaces.createCard")}
              </span>
            </button>
          )}

          {workspaces.map((workspace, index) => (
            <div
              key={workspace.id}
              className="ui-fade-up group relative flex min-h-[140px] flex-col justify-between overflow-hidden rounded-xl border border-border bg-card p-5 transition-all hover:-translate-y-1 hover:border-foreground/20 hover:shadow-xl"
              style={{ animationDelay: `${index * 40}ms` }}
            >
              {/* Декор: акцентная полоса сверху + мягкое свечение в углу, оба проявляются на hover
                  (aria-hidden — чисто визуальные, ничего не сообщают экранному диктору). */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary/0 via-primary/50 to-indigo-400/0 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-primary/10 opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
              />

              <div className="relative z-10 flex items-start justify-between">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary text-sm font-bold text-secondary-foreground">
                  {workspaceInitial(workspace.name)}
                </span>
                <div className="flex items-center gap-0.5">
                  {(canUpdate || canDelete || canSaveBlueprint) && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                          aria-label={t("workspaces.card.menu")}
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {canUpdate && (
                          <DropdownMenuItem onSelect={() => setEditTarget(workspace)}>
                            <Pencil className="h-3.5 w-3.5" />
                            {t("workspaces.card.edit")}
                          </DropdownMenuItem>
                        )}
                        {canSaveBlueprint && (
                          <DropdownMenuItem onSelect={() => setSaveBlueprintTarget(workspace)}>
                            <Sparkles className="h-3.5 w-3.5" />
                            {t("workspaces.card.saveAsBlueprint")}
                          </DropdownMenuItem>
                        )}
                        {canDelete && (
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={() => setDeleteTarget({ id: workspace.id, name: workspace.name })}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {t("workspaces.card.delete")}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                </div>
              </div>

              <div className="relative z-10 flex flex-col gap-2">
                {/* Stretched-link: единственный реальный <a> на карточке — растянут на всю площадь
                    невидимым inset-0 span'ом, поэтому клик работает где угодно (не только по
                    названию), а вложенное меню действий (выше, z-10) всё равно кликабельно
                    самостоятельно, не через <a> внутри <a>/<button> внутри <a>. */}
                <Link
                  to="/workspaces/$workspaceId"
                  params={{ workspaceId: workspace.id }}
                  className="line-clamp-2 font-semibold text-foreground transition-colors group-hover:text-primary active:scale-[0.98]"
                >
                  {workspace.name}
                  <span className="absolute inset-0 z-0" aria-hidden="true" />
                </Link>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline" className="text-[11px]">
                    {t(`workspaces.create.audience.${workspace.audience}`)}
                  </Badge>
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {dateFormatter.format(new Date(workspace.createdAt))}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {canCreate && <CreateWorkspaceDialog orgId={me.activeOrgId} open={createOpen} onOpenChange={setCreateOpen} />}
      <EditWorkspaceDialog
        key={editTarget?.id ?? "none"}
        orgId={me.activeOrgId}
        workspace={editTarget}
        open={editTarget !== null}
        onOpenChange={(open) => !open && setEditTarget(null)}
      />
      <DeleteWorkspaceDialog
        orgId={me.activeOrgId}
        workspace={deleteTarget}
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      />
      <SaveAsBlueprintDialog
        key={saveBlueprintTarget?.id ?? "none"}
        orgId={me.activeOrgId}
        workspace={saveBlueprintTarget}
        open={saveBlueprintTarget !== null}
        onOpenChange={(open) => !open && setSaveBlueprintTarget(null)}
      />
    </div>
  );
}
