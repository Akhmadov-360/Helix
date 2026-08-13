import { useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { KbArticleResponse, UpdateKbArticleInput } from "@helix/api-schemas";
import { Avatar, Button, RichTextEditor, cn } from "@helix/ui";
import { ArrowLeft, Check, Download, Loader2, Pencil, Share2, Trash2 } from "lucide-react";
import { useCan } from "../../shared/auth/ability";
import { useT } from "../../shared/i18n";
import { downloadMarkdown } from "../../shared/lib/content-to-markdown";
import { DeleteKbArticleDialog } from "./delete-kb-article-dialog";
import { useUpdateKbArticle } from "./mutations";
import { kbArticleQueryOptions, kbArticlesQueryOptions } from "./queries";
import { TagPillInput } from "./tag-pill-input";
import { type TocHeading, useHeadingsToc } from "./use-headings-toc";

const AUTOSAVE_DELAY_MS = 1200;
type SaveStatus = "idle" | "saving" | "saved";

export function KbDetailView({ orgId, articleId }: { orgId: string; articleId: string }) {
  const article = useSuspenseQuery(kbArticleQueryOptions(orgId, articleId)).data;
  const canUpdate = useCan("KBArticle.update");
  const canDelete = useCan("KBArticle.delete");

  // key=article.id — тот же приём, что PageDetailView: редактор ремонтируется с новым начальным
  // содержимым при переключении статьи.
  return <ArticleEditor key={article.id} orgId={orgId} article={article} canUpdate={canUpdate} canDelete={canDelete} />;
}

function ArticleEditor({
  orgId,
  article,
  canUpdate,
  canDelete,
}: {
  orgId: string;
  article: KbArticleResponse;
  canUpdate: boolean;
  canDelete: boolean;
}) {
  const t = useT();
  const navigate = useNavigate();
  const update = useUpdateKbArticle(orgId, article.id);
  // Словарь тегов для автокомплита — из всех статей орги (не suspense, редактор не должен ждать).
  const allArticles = useQuery(kbArticlesQueryOptions(orgId, {})).data ?? [];
  const knownTags = [...new Set(allArticles.flatMap((a) => a.tags))].sort((a, b) => a.localeCompare(b));

  const [title, setTitle] = useState(article.title);
  const [icon, setIcon] = useState(article.icon ?? "");
  const [tags, setTags] = useState(article.tags);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<UpdateKbArticleInput>({});
  const contentRef = useRef<HTMLDivElement>(null);
  const { headings, activeIndex, scrollToHeading } = useHeadingsToc(contentRef);

  function scheduleSave(patch: UpdateKbArticleInput) {
    pendingRef.current = { ...pendingRef.current, ...patch };
    setStatus("saving");
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      const payload = pendingRef.current;
      pendingRef.current = {};
      update.mutate(payload, { onSuccess: () => setStatus("saved") });
    }, AUTOSAVE_DELAY_MS);
  }

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    toast.success(t("kb.detail.linkCopied"));
  }

  return (
    <div className="mx-auto flex w-full max-w-[1000px] gap-8 py-2">
      <div className="mx-auto flex w-full max-w-[800px] flex-col gap-4">
        <Link
          to="/kb"
          className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("kb.detail.backToList")}
        </Link>

        <div className="flex items-center gap-3">
          {canUpdate ? (
            <>
              <input
                value={icon}
                onChange={(e) => {
                  setIcon(e.target.value);
                  scheduleSave({ icon: e.target.value.trim() || null });
                }}
                placeholder={t("kb.detail.iconPlaceholder")}
                aria-label={t("kb.create.icon")}
                maxLength={16}
                className="w-9 shrink-0 rounded-md border border-transparent bg-muted text-center text-lg outline-none transition-colors hover:border-border focus-visible:border-border focus-visible:ring-2 focus-visible:ring-ring"
              />
              <div className="group/title flex min-w-0 flex-1 items-center gap-1.5">
                <input
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    scheduleSave({ title: e.target.value });
                  }}
                  placeholder={t("pages.title.placeholder")}
                  aria-label={t("kb.create.label")}
                  className="min-w-0 flex-1 rounded-sm border-b border-dashed border-transparent bg-transparent px-0.5 -mx-0.5 text-xl font-semibold outline-none transition-colors placeholder:font-normal placeholder:text-muted-foreground group-hover/title:border-border focus-visible:border-border focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
                <Pencil className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/title:opacity-100" />
              </div>
            </>
          ) : (
            <>
              {icon && <span className="text-lg">{icon}</span>}
              <h1 className="min-w-0 flex-1 truncate text-xl font-semibold">{title || t("pages.title.placeholder")}</h1>
            </>
          )}

          {status !== "idle" && (
            <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
              {status === "saving" ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {t("pages.autosave.saving")}
                </>
              ) : (
                <>
                  <Check className="h-3 w-3" />
                  {t("pages.autosave.saved")}
                </>
              )}
            </span>
          )}

          <Button type="button" variant="ghost" size="icon-sm" aria-label={t("kb.detail.copyLink")} onClick={() => void copyLink()}>
            <Share2 className="h-4 w-4" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("kb.detail.download")}
            onClick={() => downloadMarkdown(title || t("pages.title.placeholder"), article.content)}
          >
            <Download className="h-4 w-4" />
          </Button>

          {canDelete && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("kb.list.delete")}
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>

        {article.authorName && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Avatar name={article.authorName} size="sm" className="h-5 w-5 text-[10px]" />
            <span>{article.authorName}</span>
          </div>
        )}

        {canUpdate ? (
          <div className="flex flex-col gap-1">
            <TagPillInput tags={tags} onChange={(next) => { setTags(next); scheduleSave({ tags: next }); }} knownTags={knownTags} />
            {/* Хинт (bug report: "не понятно, что нужно нажать Enter") — тот же приём, что
                подсказка про @-упоминание в комментариях Pages, отдельной строкой под инпутом. */}
            <p className="text-xs text-muted-foreground">{t("kb.detail.tagInputHint")}</p>
          </div>
        ) : (
          tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tags.map((tagValue) => (
                <span key={tagValue} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {tagValue}
                </span>
              ))}
            </div>
          )
        )}

        {/* Ограничение ширины контента (design review: "холст на всю ширину, 1800px тяжело
            читать") — max-w-[800px] уже задан родителем-контейнером выше, здесь только внутренний
            вертикальный отступ статьи. ref — источник для ToC (сканирует h2/h3 внутри). */}
        <div ref={contentRef} className="py-4">
          <RichTextEditor
            content={article.content}
            editable={canUpdate}
            onChange={(content) => scheduleSave({ content })}
            placeholder={t("pages.editor.placeholder")}
            toolbarLabels={{
              heading: t("pages.editor.toolbar.heading"),
              bold: t("pages.editor.toolbar.bold"),
              italic: t("pages.editor.toolbar.italic"),
              bulletList: t("pages.editor.toolbar.bulletList"),
              orderedList: t("pages.editor.toolbar.orderedList"),
              table: t("pages.editor.toolbar.table"),
            }}
          />
        </div>

        <DeleteKbArticleDialog
          orgId={orgId}
          article={{ id: article.id, title }}
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          onDeleted={() => void navigate({ to: "/kb" })}
        />
      </div>

      {headings.length > 0 && (
        <TableOfContents headings={headings} activeIndex={activeIndex} onSelect={scrollToHeading} />
      )}
    </div>
  );
}

// Оглавление (design review) — плавающая колонка в свободном пространстве справа от текста;
// свой лёгкий сканер DOM (см. use-headings-toc.ts), не @tiptap/extension-table-of-contents.
// activeIndex (bug report: "подсвечивать заголовок, в котором юзер находится") — scroll-spy.
function TableOfContents({
  headings,
  activeIndex,
  onSelect,
}: {
  headings: TocHeading[];
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  const t = useT();
  return (
    <aside className="sticky top-4 hidden h-fit w-48 shrink-0 flex-col gap-1 lg:flex">
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t("kb.detail.tableOfContents")}
      </p>
      {headings.map((h) => (
        <button
          key={h.index}
          type="button"
          onClick={() => onSelect(h.index)}
          className={cn(
            "truncate rounded-sm px-2 py-1 text-left text-xs transition-colors",
            h.index === activeIndex
              ? "bg-primary/10 font-medium text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
          style={{ paddingLeft: h.level === 3 ? "1.25rem" : "0.5rem" }}
        >
          {h.text || "…"}
        </button>
      ))}
    </aside>
  );
}
