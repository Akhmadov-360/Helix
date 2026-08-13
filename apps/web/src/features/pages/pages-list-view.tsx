import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Download, FileText, Plus, Search, Trash2 } from "lucide-react";
import { Button, Input } from "@helix/ui";
import { useCan } from "../../shared/auth/ability";
import { useLocaleStore, useT } from "../../shared/i18n";
import { downloadMarkdown } from "../../shared/lib/content-to-markdown";
import { extractSnippet } from "../../shared/lib/extract-snippet";
import { highlightMatch } from "../../shared/lib/highlight-match";
import { CreatePageDialog } from "./create-page-dialog";
import { DeletePageDialog } from "./delete-page-dialog";
import { projectPagesQueryOptions } from "./queries";

export function PagesListView({ orgId, projectId }: { orgId: string; projectId: string }) {
  const t = useT();
  const locale = useLocaleStore((state) => state.locale);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // useQuery + placeholderData (не useSuspenseQuery) — ввод в поиске не мигает пустым экраном
  // между запросами, тот же приём, что companies-view.tsx/kb-list-view.tsx.
  const { data: pages = [] } = useQuery({
    ...projectPagesQueryOptions(orgId, projectId, debounced || undefined),
    placeholderData: keepPreviousData,
  });
  const canCreate = useCan("Page.create");
  const canDelete = useCan("Page.delete");
  const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("pages.list.searchPlaceholder")}
            className="pl-8"
          />
        </div>
        {canCreate && (
          <Button type="button" size="sm" className="ml-auto" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            {t("pages.list.create")}
          </Button>
        )}
      </div>

      {pages.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
          <FileText className="h-8 w-8" />
          <p>{debounced ? t("pages.list.noResults") : t("pages.list.empty")}</p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
          {pages.map((page) => {
            const snippet = debounced ? extractSnippet(page.content, debounced) : null;
            return (
              <li key={page.id} className="group flex items-center justify-between gap-2 px-3 py-2.5">
                <Link
                  to="/pages/$pageId"
                  params={{ pageId: page.id }}
                  className="flex min-w-0 flex-1 items-center gap-2 text-sm hover:underline"
                >
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{debounced ? highlightMatch(page.title, debounced) : page.title}</span>
                    {/* Шаг B: подсветка совпадения внутри сниппета — тот же highlightMatch, что title. */}
                    {snippet && (
                      <span className="truncate text-xs font-normal text-muted-foreground no-underline">
                        {highlightMatch(snippet, debounced)}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {dateFormatter.format(new Date(page.updatedAt))}
                  </span>
                </Link>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("pages.detail.download")}
                  className="opacity-0 group-hover:opacity-100"
                  onClick={() => downloadMarkdown(page.title || t("pages.title.placeholder"), page.content)}
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
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
            );
          })}
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
