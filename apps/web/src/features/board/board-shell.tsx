import { useState } from "react";
import { LayoutGrid, Plus, Table2 } from "lucide-react";
import type { CompanyResponse, WorkspaceResponse } from "@helix/api-schemas";
import { Button, cn } from "@helix/ui";
import { useCan } from "../../shared/auth/ability";
import { useT } from "../../shared/i18n";
import { WorkspaceMenu } from "../workspaces/workspace-menu";
import { BoardFilterPopover } from "./board-filter-popover";
import { EMPTY_FILTER, type BoardFilterState } from "./board-filter";
import { BoardView } from "./board-view";
import { CreateDealDialog } from "./create-deal-dialog";
import { TableView } from "./table-view";

export type BoardDisplayMode = "board" | "table";

interface Props {
  orgId: string;
  workspaceId: string;
  workspace: WorkspaceResponse;
  companies: CompanyResponse[];
  view: BoardDisplayMode;
  onViewChange: (view: BoardDisplayMode) => void;
}

// Хедер (кнопка создания + переключатель Доска/Таблица) живёт на уровне страницы, а не внутри
// BoardView — оба вида делят одну строку, а Table view не владеет DnD-состоянием доски и не должен
// его тянуть только ради общей кнопки.
export function BoardShell({ orgId, workspaceId, workspace, companies, view, onViewChange }: Props) {
  const t = useT();
  const canCreate = useCan("Project.create");
  const [createOpen, setCreateOpen] = useState(false);
  // Фильтр в top-level shell, не в BoardView: пережил бы переключение Board↔Table без сброса
  // (сейчас применяем только к Board, но хук-точка расширения без реорганизации state в будущем).
  const [filter, setFilter] = useState<BoardFilterState>(EMPTY_FILTER);

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex shrink-0 items-center justify-between gap-3">
        {canCreate ? (
          <Button type="button" size="sm" className="w-fit" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            {t("board.create.trigger")}
          </Button>
        ) : (
          <div />
        )}
        <div className="flex items-center gap-2">
          {view === "board" && <BoardFilterPopover orgId={orgId} filter={filter} onChange={setFilter} />}
          <div role="group" aria-label={t("board.view.toggle")} className="flex items-center rounded-lg border border-border p-0.5">
            <ViewToggleButton active={view === "board"} icon={LayoutGrid} label={t("board.view.board")} onClick={() => onViewChange("board")} />
            <ViewToggleButton active={view === "table"} icon={Table2} label={t("board.view.table")} onClick={() => onViewChange("table")} />
          </div>
          <WorkspaceMenu orgId={orgId} workspace={workspace} trigger="toolbar" />
        </div>
      </div>
      <div className="min-h-0 flex-1">
        {view === "board" ? (
          <BoardView orgId={orgId} workspaceId={workspaceId} companies={companies} filter={filter} />
        ) : (
          <TableView orgId={orgId} workspaceId={workspaceId} companies={companies} />
        )}
      </div>
      <CreateDealDialog
        orgId={orgId}
        workspaceId={workspaceId}
        companies={companies}
        companyRequired={workspace.audience === "B2B"}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
    </div>
  );
}

function ViewToggleButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof LayoutGrid;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
