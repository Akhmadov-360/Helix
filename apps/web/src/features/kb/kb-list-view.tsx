import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { keepPreviousData, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { BookOpen, Download, Plus, Search, Trash2 } from "lucide-react";
import {
  Avatar,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@helix/ui";
import { useCan } from "../../shared/auth/ability";
import { useLocaleStore, useT } from "../../shared/i18n";
import { downloadMarkdown } from "../../shared/lib/content-to-markdown";
import { extractExcerpt, extractSnippet } from "../../shared/lib/extract-snippet";
import { highlightMatch } from "../../shared/lib/highlight-match";
import { workspacesQueryOptions } from "../workspaces/queries";
import { CreateKbArticleDialog } from "./create-kb-article-dialog";
import { DeleteKbArticleDialog } from "./delete-kb-article-dialog";
import { kbArticlesQueryOptions } from "./queries";
import { tagColorClass } from "./tag-color";
import { TagFilterSelect } from "./tag-filter-select";

const ALL_WORKSPACES = "all";

export function KbListView({ orgId }: { orgId: string }) {
  const t = useT();
  const locale = useLocaleStore((state) => state.locale);
  const workspaces = useSuspenseQuery(workspacesQueryOptions(orgId)).data;
  const workspaceNameById = useMemo(() => new Map(workspaces.map((w) => [w.id, w.name])), [workspaces]);
  const canCreate = useCan("KBArticle.create");
  const canDelete = useCan("KBArticle.delete");
  const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const [tag, setTag] = useState("");
  const [workspaceFilter, setWorkspaceFilter] = useState(ALL_WORKSPACES);

  const workspaceIdParam = workspaceFilter === ALL_WORKSPACES ? undefined : workspaceFilter;
  const query = { q: debouncedSearch || undefined, tag: tag || undefined, workspaceId: workspaceIdParam };
  // useQuery + placeholderData (не useSuspenseQuery) — смена фильтров не должна мигать пустым
  // экраном, тот же приём, что companies-view.tsx.
  const { data: articles = [] } = useQuery({ ...kbArticlesQueryOptions(orgId, query), placeholderData: keepPreviousData });

  // Словарь тегов для TagFilterSelect/TagPillInput — из ОТДЕЛЬНОГО запроса без tag/q (иначе выбор
  // тега схлопнул бы список кандидатов до одного, а поиск — до случайного подмножества); тот же
  // "candidates из уже загруженных данных" приём, что wiki-ссылки, не отдельный backend-эндпоинт.
  const { data: allArticlesInScope = [] } = useQuery(kbArticlesQueryOptions(orgId, { workspaceId: workspaceIdParam }));
  const knownTags = useMemo(
    () => [...new Set(allArticlesInScope.flatMap((a) => a.tags))].sort((a, b) => a.localeCompare(b)),
    [allArticlesInScope],
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("kb.page.searchPlaceholder")}
            className="pl-8"
          />
        </div>
        <TagFilterSelect value={tag} onChange={setTag} knownTags={knownTags} />
        <Select value={workspaceFilter} onValueChange={setWorkspaceFilter}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_WORKSPACES}>{t("kb.workspace.all")}</SelectItem>
            {workspaces.map((ws) => (
              <SelectItem key={ws.id} value={ws.id}>
                {ws.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {canCreate && (
          <Button type="button" size="sm" className="ml-auto" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            {t("kb.list.create")}
          </Button>
        )}
      </div>

      {articles.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
          <BookOpen className="h-8 w-8" />
          <p>{debouncedSearch || tag ? t("kb.page.noResults") : t("kb.list.empty")}</p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((article) => {
            // Превью текста (design review: "мёртвая пустота в карточке") — сниппет вокруг
            // совпадения при активном поиске, иначе просто начало текста (Шаг A/B — тот же приём,
            // что pages-list-view.tsx, plus всегда-видимый excerpt без поиска).
            const snippet = debouncedSearch ? extractSnippet(article.content, debouncedSearch) : extractExcerpt(article.content);
            return (
              <li key={article.id} className="group relative rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/40">
                <Link to="/kb/$articleId" params={{ articleId: article.id }} className="flex flex-col gap-2">
                  <div className="flex items-start gap-2">
                    {/* Иконка/эмодзи (Notion-style) — визуальный якорь карточки, "разбивает шум" (design review). */}
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-lg">
                      {article.icon || <BookOpen className="h-4 w-4 text-muted-foreground" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {debouncedSearch ? highlightMatch(article.title, debouncedSearch) : article.title}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {article.workspaceId ? workspaceNameById.get(article.workspaceId) : t("kb.workspace.orgWide")}
                      </p>
                    </div>
                  </div>

                  {snippet && (
                    <p className="line-clamp-2 text-sm text-muted-foreground">
                      {debouncedSearch ? highlightMatch(snippet, debouncedSearch) : snippet}
                    </p>
                  )}

                  {article.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {article.tags.map((tagValue) => (
                        <span key={tagValue} className={`rounded-full px-2 py-0.5 text-xs ${tagColorClass(tagValue)}`}>
                          {tagValue}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1">
                    {/* Автор (design review: "профессиональной отделки") — аватар с инициалами,
                        как в комментариях Pages; null (сид блюпринта/удалённый юзер) — просто без бейджа. */}
                    {article.authorName ? (
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Avatar name={article.authorName} size="sm" className="h-5 w-5 text-[10px]" />
                        <span className="truncate">{article.authorName}</span>
                      </span>
                    ) : (
                      <span />
                    )}
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {dateFormatter.format(new Date(article.updatedAt))}
                    </span>
                  </div>
                </Link>

                <div className="absolute right-2 top-2 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("kb.detail.download")}
                    onClick={() => downloadMarkdown(article.title, article.content)}
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  {canDelete && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("kb.list.delete")}
                      onClick={() => setDeleteTarget({ id: article.id, title: article.title })}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <CreateKbArticleDialog orgId={orgId} open={createOpen} onOpenChange={setCreateOpen} />
      <DeleteKbArticleDialog
        orgId={orgId}
        article={deleteTarget}
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      />
    </div>
  );
}
