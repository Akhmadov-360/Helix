import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Link } from "@tanstack/react-router";
import { Archive, Calendar, CheckSquare, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { CompanyResponse } from "@helix/api-schemas";
import {
  Avatar,
  avatarVariants,
  Badge,
  Button,
  Card,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@helix/ui";

// Больше 3 участников — "+N" вместо бесконечного стека аватаров (карта фиксированной ширины
// w-72, стек не должен расти неограниченно).
const MAX_VISIBLE_ASSIGNEES = 3;
import { useCan } from "../../shared/auth/ability";
import { useLocaleStore, useT } from "../../shared/i18n";
import { DeleteProjectDialog } from "./delete-project-dialog";
import { EditDealDialog } from "./edit-deal-dialog";
import { formatAmount } from "./format";
import { useArchiveProject } from "./mutations";
import type { ProjectCardViewModel } from "./select";

interface Props {
  project: ProjectCardViewModel;
  orgId: string;
  workspaceId: string;
  companies: CompanyResponse[];
  overlay?: boolean;
}

// `Card` (packages/ui) не forwardRef — dnd-kit нужен реальный DOM-узел, поэтому ref/drag-атрибуты
// на обёртке, Card остаётся чистым визуальным примитивом (композиция, не форк).
export function ProjectCard({ project, orgId, workspaceId, companies, overlay = false }: Props) {
  const t = useT();
  const locale = useLocaleStore((state) => state.locale);
  // §8.2: FE-capability — косметика (сервер всё равно единственный энфорсер move), но без неё
  // юзер без Project.update мог бы бесконечно поднимать/бросать карту, каждый раз получая 403.
  const canMove = useCan("Project.update");
  const canArchive = useCan("Project.update");
  const canDelete = useCan("Project.delete");
  const disabled = overlay || !canMove;
  const sortable = useSortable({ id: project.id, disabled });
  const archive = useArchiveProject(orgId, workspaceId);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const style = overlay
    ? undefined
    : { transform: CSS.Translate.toString(sortable.transform), transition: sortable.transition };

  const dateFormatter = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short" });

  return (
    <div
      ref={overlay ? undefined : sortable.setNodeRef}
      style={style}
      {...(disabled ? {} : sortable.attributes)}
      {...(disabled ? {} : sortable.listeners)}
      role="listitem"
      tabIndex={overlay ? undefined : 0}
      className={cn(
        "touch-none",
        !disabled && "cursor-grab active:cursor-grabbing",
        sortable.isDragging && "opacity-40",
      )}
    >
      <Card className={cn("relative flex flex-col gap-2 p-3 pr-9", overlay && "shadow-lg")}>
        {/* Меню — absolute поверх карточки, а не в отдельной flex-строке (§UI-фикс): раньше
            строка рендерилась ВСЕГДА (даже без source), из-за чего пустая карточка без источника
            получала лишний пустой ряд сверху. */}
        {!overlay && (canArchive || canDelete) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1.5 top-1.5 h-6 w-6 shrink-0 text-muted-foreground"
                aria-label={t("board.card.menu")}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canArchive && (
                <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                  <Pencil className="h-3.5 w-3.5" />
                  {t("board.card.edit")}
                </DropdownMenuItem>
              )}
              {canArchive && (
                <DropdownMenuItem onSelect={() => archive.mutate({ id: project.id, title: project.title })}>
                  <Archive className="h-3.5 w-3.5" />
                  {t("board.card.archive")}
                </DropdownMenuItem>
              )}
              {canDelete && (
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => setDeleteOpen(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t("board.card.delete")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {project.source && (
          <Badge variant="outline" className="w-fit text-[11px]">
            {project.source}
          </Badge>
        )}

        {overlay ? (
          <p className="text-sm font-medium text-foreground">{project.title}</p>
        ) : (
          <Link
            to="/projects/$projectId/contacts"
            params={{ projectId: project.id }}
            className="text-sm font-medium text-foreground transition-colors hover:text-accent"
          >
            {project.title}
          </Link>
        )}
        {project.amount && (
          <p className="text-xs font-semibold text-accent">{formatAmount(project.amount, locale)}</p>
        )}

        <div className="flex items-center justify-between border-t border-border pt-2 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {dateFormatter.format(new Date(project.createdAt))}
            </span>
            {project.totalTasksCount > 0 && (
              <span className="flex items-center gap-1">
                <CheckSquare className="h-3 w-3" />
                {project.doneTasksCount}/{project.totalTasksCount}
              </span>
            )}
          </div>
          {project.assignees.length > 0 && (
            <div className="flex -space-x-2">
              {project.assignees.slice(0, MAX_VISIBLE_ASSIGNEES).map((assignee) => (
                <Avatar key={assignee.userId} name={assignee.name} size="sm" className="ring-2 ring-card" />
              ))}
              {project.assignees.length > MAX_VISIBLE_ASSIGNEES && (
                <span className={cn(avatarVariants({ size: "sm" }), "ring-2 ring-card")}>
                  +{project.assignees.length - MAX_VISIBLE_ASSIGNEES}
                </span>
              )}
            </div>
          )}
        </div>
      </Card>

      {!overlay && (
        <>
          <DeleteProjectDialog
            orgId={orgId}
            workspaceId={workspaceId}
            project={deleteOpen ? project : null}
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
          />
          <EditDealDialog
            orgId={orgId}
            workspaceId={workspaceId}
            companies={companies}
            project={
              editOpen
                ? {
                    id: project.id,
                    title: project.title,
                    value: project.amount?.value ?? null,
                    currency: project.amount?.currency ?? null,
                    source: project.source,
                    companyId: project.companyId,
                  }
                : null
            }
            open={editOpen}
            onOpenChange={setEditOpen}
          />
        </>
      )}
    </div>
  );
}
