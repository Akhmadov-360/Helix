import { useQuery } from "@tanstack/react-query";
import { Archive } from "lucide-react";
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@helix/ui";
import { useLocaleStore, useT } from "../../shared/i18n";
import { archivedProjectsQueryOptions } from "./queries";
import { useRestoreProject } from "./mutations";

export function ArchivedLeadsDialog({
  orgId,
  workspaceId,
  open,
  onOpenChange,
}: {
  orgId: string;
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("workspaces.archive.title")}</DialogTitle>
          <DialogDescription>{t("workspaces.archive.description")}</DialogDescription>
        </DialogHeader>
        {open && <ArchivedLeadsList orgId={orgId} workspaceId={workspaceId} />}
      </DialogContent>
    </Dialog>
  );
}

// useQuery (не useSuspenseQuery) намеренно: диалог открывается императивно, не через route
// loader — суспенс здесь подвесил бы всю страницу ЗА диалогом, пока грузится список архива.
function ArchivedLeadsList({ orgId, workspaceId }: { orgId: string; workspaceId: string }) {
  const t = useT();
  const locale = useLocaleStore((state) => state.locale);
  const { data: projects = [], isPending } = useQuery(archivedProjectsQueryOptions(orgId, workspaceId));
  const restore = useRestoreProject(orgId, workspaceId);
  const dateFormatter = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric" });

  if (isPending) {
    return <p className="py-10 text-center text-sm text-muted-foreground">{t("workspaces.archive.loading")}</p>;
  }

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
        <Archive className="h-8 w-8" />
        <p>{t("workspaces.archive.empty")}</p>
      </div>
    );
  }

  return (
    <div className="scroll-slim flex max-h-80 flex-col gap-1 overflow-y-auto">
      {projects.map((project) => (
        <div key={project.id} className="flex items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-muted">
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium text-foreground">{project.title}</span>
            <span className="text-xs text-muted-foreground">{dateFormatter.format(new Date(project.updatedAt))}</span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={restore.isPending}
            onClick={() => restore.mutate({ id: project.id, title: project.title })}
          >
            {t("workspaces.archive.restore")}
          </Button>
        </div>
      ))}
    </div>
  );
}
