import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { FileText, Plus, Trash2 } from "lucide-react";
import { Button } from "@helix/ui";
import { useCan } from "../../shared/auth/ability";
import { useLocaleStore, useT } from "../../shared/i18n";
import { CreatePageDialog } from "./create-page-dialog";
import { DeletePageDialog } from "./delete-page-dialog";
import { projectPagesQueryOptions } from "./queries";

export function PagesListView({ orgId, projectId }: { orgId: string; projectId: string }) {
  const t = useT();
  const locale = useLocaleStore((state) => state.locale);
  const pages = useSuspenseQuery(projectPagesQueryOptions(orgId, projectId)).data;
  const canCreate = useCan("Page.create");
  const canDelete = useCan("Page.delete");
  const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);

  return (
    <div className="flex flex-col gap-4">
      {canCreate && (
        <div>
          <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            {t("pages.list.create")}
          </Button>
        </div>
      )}

      {pages.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
          <FileText className="h-8 w-8" />
          <p>{t("pages.list.empty")}</p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
          {pages.map((page) => (
            <li key={page.id} className="group flex items-center justify-between gap-2 px-3 py-2.5">
              <Link
                to="/projects/$projectId/pages/$pageId"
                params={{ projectId, pageId: page.id }}
                className="flex min-w-0 flex-1 items-center gap-2 text-sm hover:underline"
              >
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{page.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {dateFormatter.format(new Date(page.updatedAt))}
                </span>
              </Link>
              {canDelete && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("pages.list.delete")}
                  className="opacity-0 group-hover:opacity-100"
                  onClick={() => setDeleteTarget({ id: page.id, title: page.title })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <CreatePageDialog orgId={orgId} projectId={projectId} open={createOpen} onOpenChange={setCreateOpen} />
      <DeletePageDialog
        orgId={orgId}
        projectId={projectId}
        page={deleteTarget}
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      />
    </div>
  );
}
