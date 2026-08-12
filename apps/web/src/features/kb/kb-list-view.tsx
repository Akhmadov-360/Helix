import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { keepPreviousData, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { BookOpen, Plus, Trash2 } from "lucide-react";
import {
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
import { workspacesQueryOptions } from "../workspaces/queries";
import { CreateKbArticleDialog } from "./create-kb-article-dialog";
import { DeleteKbArticleDialog } from "./delete-kb-article-dialog";
import { kbArticlesQueryOptions } from "./queries";

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
  const [debouncedTag, setDebouncedTag] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedTag(tag.trim()), 300);
    return () => clearTimeout(timer);
  }, [tag]);
  const [workspaceFilter, setWorkspaceFilter] = useState(ALL_WORKSPACES);

  const query = {
    q: debouncedSearch || undefined,
    tag: debouncedTag || undefined,
    workspaceId: workspaceFilter === ALL_WORKSPACES ? undefined : workspaceFilter,
  };
  // useQuery + placeholderData (не useSuspenseQuery) — смена фильтров не должна мигать пустым
  // экраном, тот же приём, что companies-view.tsx.
  const { data: articles = [] } = useQuery({ ...kbArticlesQueryOptions(orgId, query), placeholderData: keepPreviousData });

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("kb.page.searchPlaceholder")}
          className="max-w-xs"
        />
        <Input
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          placeholder={t("kb.page.tagPlaceholder")}
          className="max-w-40"
        />
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
          <p>{debouncedSearch || debouncedTag ? t("kb.page.noResults") : t("kb.list.empty")}</p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
          {articles.map((article) => (
            <li key={article.id} className="group flex items-center justify-between gap-2 px-3 py-2.5">
              {/* Метаданные (воркспейс/теги/дата) — отдельной строкой снизу, не в одну line с
                  title: при узком контейнере shrink-0 сиблинги (особенно длинная метка воркспейса)
                  съедали всю ширину и схлопывали truncate-заголовок до 0px (реальный баг, найден
                  в браузере) — тот же приём, что AttachmentCard (title/description). */}
              <Link
                to="/kb/$articleId"
                params={{ articleId: article.id }}
                className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm hover:underline"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 truncate">{article.title}</span>
                </span>
                <span className="flex flex-wrap items-center gap-1.5 pl-6 text-xs text-muted-foreground">
                  <span>{article.workspaceId ? workspaceNameById.get(article.workspaceId) : t("kb.workspace.orgWide")}</span>
                  {article.tags.map((tagValue) => (
                    <span key={tagValue} className="rounded-full bg-muted px-2 py-0.5">
                      {tagValue}
                    </span>
                  ))}
                  <span className="ml-auto shrink-0">{dateFormatter.format(new Date(article.updatedAt))}</span>
                </span>
              </Link>
              {canDelete && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("kb.list.delete")}
                  className="opacity-0 group-hover:opacity-100"
                  onClick={() => setDeleteTarget({ id: article.id, title: article.title })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </li>
          ))}
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
