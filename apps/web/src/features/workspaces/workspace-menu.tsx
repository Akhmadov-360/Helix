import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Archive, MoreHorizontal, Pencil, SlidersHorizontal, Sparkles, Trash2 } from "lucide-react";
import type { WorkspaceResponse } from "@helix/api-schemas";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@helix/ui";
import { useCan } from "../../shared/auth/ability";
import { useT } from "../../shared/i18n";
import { ArchivedLeadsDialog } from "../board/archived-leads-dialog";
import { DeleteWorkspaceDialog } from "./delete-workspace-dialog";
import { EditWorkspaceDialog } from "./edit-workspace-dialog";
import { SaveAsBlueprintDialog } from "./save-as-blueprint-dialog";

// Единая точка входа в "настройки этой доски" (по образцу board-level "⋯" в Trello) — раньше
// эти же действия были разбросаны: поля доступны только по ссылке-подсказке из диалога лида,
// шаблон/изменить/удалить — только с карточки в /workspaces (недостижимо, когда уже открыл
// доску), архива не было вообще. Задел на будущее: automations/webhooks (M5) втыкаются сюда же.
export function WorkspaceMenu({
  orgId,
  workspace,
  trigger,
}: {
  orgId: string;
  workspace: WorkspaceResponse;
  /** Card-контекст просит свой стиль триггера (иконка поверх карточки); доска — обычную кнопку. */
  trigger?: "card" | "toolbar";
}) {
  const t = useT();
  const canUpdate = useCan("Workspace.update");
  const canDelete = useCan("Workspace.delete");
  const canSaveBlueprint = useCan("Blueprint.create"); // blueprints.md §6: Manage blueprints = O/A only
  const canReadFields = useCan("FieldDefinition.read");

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [saveBlueprintOpen, setSaveBlueprintOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const triggerClassName =
    trigger === "card"
      ? "h-7 w-7 text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
      : "h-8 w-8 text-muted-foreground";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant={trigger === "card" ? "ghost" : "outline"}
            size="icon"
            className={triggerClassName}
            aria-label={t("workspaces.card.menu")}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canReadFields && (
            <DropdownMenuItem asChild>
              <Link to="/workspaces/$workspaceId/fields" params={{ workspaceId: workspace.id }}>
                <SlidersHorizontal className="h-3.5 w-3.5" />
                {t("workspaces.card.fields")}
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => setArchiveOpen(true)}>
            <Archive className="h-3.5 w-3.5" />
            {t("workspaces.card.archive")}
          </DropdownMenuItem>
          {(canUpdate || canSaveBlueprint || canDelete) && <DropdownMenuSeparator />}
          {canUpdate && (
            <DropdownMenuItem onSelect={() => setEditOpen(true)}>
              <Pencil className="h-3.5 w-3.5" />
              {t("workspaces.card.edit")}
            </DropdownMenuItem>
          )}
          {canSaveBlueprint && (
            <DropdownMenuItem onSelect={() => setSaveBlueprintOpen(true)}>
              <Sparkles className="h-3.5 w-3.5" />
              {t("workspaces.card.saveAsBlueprint")}
            </DropdownMenuItem>
          )}
          {canDelete && (
            <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleteOpen(true)}>
              <Trash2 className="h-3.5 w-3.5" />
              {t("workspaces.card.delete")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ArchivedLeadsDialog orgId={orgId} workspaceId={workspace.id} open={archiveOpen} onOpenChange={setArchiveOpen} />
      <EditWorkspaceDialog orgId={orgId} workspace={editOpen ? workspace : null} open={editOpen} onOpenChange={setEditOpen} />
      <DeleteWorkspaceDialog orgId={orgId} workspace={deleteOpen ? workspace : null} open={deleteOpen} onOpenChange={setDeleteOpen} />
      <SaveAsBlueprintDialog
        orgId={orgId}
        workspace={saveBlueprintOpen ? workspace : null}
        open={saveBlueprintOpen}
        onOpenChange={setSaveBlueprintOpen}
      />
    </>
  );
}
