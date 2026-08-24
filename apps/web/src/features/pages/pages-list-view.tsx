import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Download, FileText, MoreHorizontal, Plus, Search, Trash2, Upload } from "lucide-react";
import type { PageResponse } from "@helix/api-schemas";
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
} from "@helix/ui";
import { useCan } from "../../shared/auth/ability";
import { useLocaleStore, useT } from "../../shared/i18n";
import { extractExcerpt, extractSnippet } from "../../shared/lib/extract-snippet";
import { formatRelative } from "../../shared/lib/format-relative";
import { highlightMatch } from "../../shared/lib/highlight-match";
import { CreatePageDialog } from "./create-page-dialog";
import { DeletePageDialog } from "./delete-page-dialog";
import { ExportPageDialog } from "./export-page-dialog";
import { ImportPageDialog } from "./import/import-page-dialog";
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
  const relativeFormatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const absoluteFormatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  // Export-dialog поднимается ЗДЕСЬ (не в PageCard): один инстанс на весь список — Radix Portal
  // экономит DOM (иначе N карточек = N спрятанных диалогов), а per-page target передаётся через
  // локальный state карточки → callback.
  const [exportTarget, setExportTarget] = useState<{ title: string; content: unknown } | null>(null);

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
          <div className="ml-auto flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="mr-1.5 h-4 w-4" />
              {t("pages.list.import")}
            </Button>
            <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              {t("pages.list.create")}
            </Button>
          </div>
        )}
      </div>

      {pages.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
          <FileText className="h-8 w-8" />
          <p>{debounced ? t("pages.list.noResults") : t("pages.list.empty")}</p>
        </div>
      ) : (
        // Bento-grid (Figma-redesign): 1 колонка на mobile, 2 на десктопе. Карточка вмещает
        // preview из 3 строк + relative time + kebab — читается плотнее чем divide-y список
        // при 5+ страницах.
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {pages.map((page) => (
            <PageCard
              key={page.id}
              page={page}
              search={debounced}
              relativeFormatter={relativeFormatter}
              absoluteFormatter={absoluteFormatter}
              canDelete={canDelete}
              onExportClick={() =>
                setExportTarget({
                  title: page.title || t("pages.title.placeholder"),
                  content: page.content,
                })
              }
              onDeleteClick={() => setDeleteTarget({ id: page.id, title: page.title })}
            />
          ))}
        </ul>
      )}

      <CreatePageDialog orgId={orgId} projectId={projectId} open={createOpen} onOpenChange={setCreateOpen} />
      <ImportPageDialog orgId={orgId} projectId={projectId} open={importOpen} onOpenChange={setImportOpen} />
      <ExportPageDialog
        title={exportTarget?.title ?? ""}
        content={exportTarget?.content}
        open={exportTarget !== null}
        onOpenChange={(open) => !open && setExportTarget(null)}
      />
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

// Page-card из Figma-разбора: colored icon-square + title + 3-line preview + relative time + kebab.
// Клик по всей карточке → детали (Link оборачивает контент, kebab — вне линка, не всплывает).
// Icon цвет — акцентный тон (accent/10 bg + accent icon), в Figma были разные цвета per-card но
// они декоративные, не осмысленные: делаем один консистентный accent (без «randomness»-хаков).
function PageCard({
  page,
  search,
  relativeFormatter,
  absoluteFormatter,
  canDelete,
  onExportClick,
  onDeleteClick,
}: {
  page: PageResponse;
  search: string;
  relativeFormatter: Intl.RelativeTimeFormat;
  absoluteFormatter: Intl.DateTimeFormat;
  canDelete: boolean;
  onExportClick: () => void;
  onDeleteClick: () => void;
}) {
  const t = useT();
  const preview = search ? extractSnippet(page.content, search) : extractExcerpt(page.content);
  const relative = formatRelative(page.updatedAt, relativeFormatter);
  const absolute = absoluteFormatter.format(new Date(page.updatedAt));

  return (
    <li className="relative">
      <Link
        to="/pages/$pageId"
        params={{ pageId: page.id }}
        className={cn(
          "flex h-full flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-colors",
          "hover:border-border/80 hover:bg-muted/40",
        )}
      >
        <div className="flex items-start gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent">
            <FileText className="h-4 w-4" />
          </span>
          <h3 className="min-w-0 flex-1 pt-1 text-sm font-semibold text-foreground">
            {search ? highlightMatch(page.title, search) : page.title}
          </h3>
        </div>
        {preview && (
          <p className="line-clamp-3 text-sm text-muted-foreground">
            {search ? highlightMatch(preview, search) : preview}
          </p>
        )}
        <span
          className="mt-auto shrink-0 text-xs text-muted-foreground"
          title={absolute}
        >
          {relative}
        </span>
      </Link>

      {/* Kebab-меню вне Link (позиционирование absolute) — клик не всплывает до карточки,
          отдельная точка взаимодействия. Всегда видим, не hover-only. */}
      <div className="absolute right-2 top-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              aria-label={t("pages.list.actions")}
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onExportClick}>
              <Download className="h-3.5 w-3.5" />
              {t("pages.export.trigger")}
            </DropdownMenuItem>
            {canDelete && (
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={onDeleteClick}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t("pages.list.delete")}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}
