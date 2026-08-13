import { useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { PageResponse, UpdatePageInput } from "@helix/api-schemas";
import { Button, RichTextEditor } from "@helix/ui";
import { ArrowLeft, Check, Download, History, Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useCan } from "../../shared/auth/ability";
import { useT } from "../../shared/i18n";
import { fetchDownloadUrl } from "../attachments/mutations";
import { projectAttachmentsQueryOptions } from "../attachments/queries";
import { downloadMarkdown } from "../../shared/lib/content-to-markdown";
import { navigateToDownload } from "../../shared/lib/navigate-to-download";
import { DeletePageDialog } from "./delete-page-dialog";
import { useUpdatePage } from "./mutations";
import { PageComments } from "./page-comments";
import { PageVersionHistoryDialog } from "./page-version-history-dialog";
import { pageQueryOptions, projectPagesQueryOptions } from "./queries";

const AUTOSAVE_DELAY_MS = 1200;
type SaveStatus = "idle" | "saving" | "saved";

// Вне ProjectDetailShell (design review: "чтобы комментарии имели больше места") — своя,
// отдельная от табов сделки страница; projectId для навигации назад берётся из самой PageResponse.
export function PageDetailView({ orgId, pageId }: { orgId: string; pageId: string }) {
  const page = useSuspenseQuery(pageQueryOptions(orgId, pageId)).data;
  const canUpdate = useCan("Page.update");
  const canDelete = useCan("Page.delete");

  // key=page.id — переключение на другую страницу ремонтирует редактор с новым начальным
  // содержимым (RichTextEditor читает content один раз при монтировании, см. её комментарий).
  return <PageEditor key={page.id} orgId={orgId} page={page} canUpdate={canUpdate} canDelete={canDelete} />;
}

function PageEditor({
  orgId,
  page,
  canUpdate,
  canDelete,
}: {
  orgId: string;
  page: PageResponse;
  canUpdate: boolean;
  canDelete: boolean;
}) {
  const t = useT();
  const navigate = useNavigate();
  const projectId = page.projectId;
  const update = useUpdatePage(orgId, projectId, page.id);
  // Кандидаты для wiki-ссылок ("[[") — все страницы ЭТОГО проекта; не suspense — автокомплит
  // работает по факту загрузки, редактор не должен ждать этот запрос, чтобы отрендериться.
  const projectPages = useQuery(projectPagesQueryOptions(orgId, projectId)).data ?? [];
  const pageLinkCandidates = projectPages
    .filter((p) => p.id !== page.id)
    .map((p) => ({ id: p.id, title: p.title }));
  // pages-kb.md §6 — кандидаты для attachment-embed: файлы этого же проекта; тот же "не suspense"
  // приём, что pageLinkCandidates выше.
  const projectAttachments = useQuery(projectAttachmentsQueryOptions(orgId, projectId)).data ?? [];
  const attachmentCandidates = projectAttachments.map((a) => ({ id: a.id, filename: a.filename }));

  async function handleDownloadAttachment(attachmentId: string) {
    try {
      const url = await fetchDownloadUrl(projectId, attachmentId, "attachment");
      navigateToDownload(url);
    } catch {
      toast.error(t("attachments.error.unexpected"));
    }
  }

  const [title, setTitle] = useState(page.title);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<UpdatePageInput>({});

  function scheduleSave(patch: UpdatePageInput) {
    pendingRef.current = { ...pendingRef.current, ...patch };
    setStatus("saving");
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      const payload = pendingRef.current;
      pendingRef.current = {};
      update.mutate(payload, { onSuccess: () => setStatus("saved") });
    }, AUTOSAVE_DELAY_MS);
  }


  return (
    // h-full min-h-0 — тот же containerClassName-приём, что Table по проекту: страница получает
    // реальную высоту от AppShell (main — flex-1 внутри h-dvh). < lg: колонка как раньше (шапка+
    // редактор естественной высоты, комментарии забирают остаток и скроллятся сами). >= lg (design
    // review): двухколоночный layout — редактор слева (растягивается, скроллится сам при длинном
    // документе), комментарии — сайдбар фиксированной ширины справа на всю высоту страницы.
    <div className="flex h-full min-h-0 w-full flex-col gap-3 lg:flex-row lg:items-stretch lg:gap-6">
      <div className="scroll-slim flex shrink-0 flex-col gap-3 lg:min-h-0 lg:flex-1 lg:shrink lg:overflow-y-auto lg:pr-1">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
          <Link
            to="/projects/$projectId/pages"
            params={{ projectId }}
            className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t("pages.detail.backToList")}
          </Link>

          <div className="flex items-center gap-3">
            {canUpdate ? (
              <div className="group/title flex min-w-0 flex-1 items-center gap-1.5">
                <input
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    scheduleSave({ title: e.target.value });
                  }}
                  placeholder={t("pages.title.placeholder")}
                  aria-label={t("pages.title.ariaLabel")}
                  className="min-w-0 flex-1 rounded-sm border-b border-dashed border-transparent bg-transparent px-0.5 -mx-0.5 text-xl font-semibold outline-none transition-colors placeholder:font-normal placeholder:text-muted-foreground group-hover/title:border-border focus-visible:border-border focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
                <Pencil className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/title:opacity-100" />
              </div>
            ) : (
              <h1 className="min-w-0 flex-1 truncate text-xl font-semibold">{title || t("pages.title.placeholder")}</h1>
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

            {canUpdate && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t("pages.history.title")}
                onClick={() => setHistoryOpen(true)}
              >
                <History className="h-4 w-4" />
              </Button>
            )}

            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("pages.detail.download")}
              onClick={() => downloadMarkdown(title.trim() || t("pages.title.placeholder"), page.content)}
            >
              <Download className="h-4 w-4" />
            </Button>

            {canDelete && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t("pages.list.delete")}
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>

          <RichTextEditor
            content={page.content}
            editable={canUpdate}
            onChange={(content) => scheduleSave({ content })}
            placeholder={t("pages.editor.placeholder")}
            pageLinkCandidates={pageLinkCandidates}
            onNavigateToPage={(id) => void navigate({ to: "/pages/$pageId", params: { pageId: id } })}
            attachmentCandidates={attachmentCandidates}
            onDownloadAttachment={(id) => void handleDownloadAttachment(id)}
            toolbarLabels={{
              heading: t("pages.editor.toolbar.heading"),
              bold: t("pages.editor.toolbar.bold"),
              italic: t("pages.editor.toolbar.italic"),
              bulletList: t("pages.editor.toolbar.bulletList"),
              orderedList: t("pages.editor.toolbar.orderedList"),
              table: t("pages.editor.toolbar.table"),
              pageLink: t("pages.editor.toolbar.pageLink"),
              pageLinkTooltip: t("pages.editor.toolbar.pageLinkTooltip"),
              insertFile: t("pages.editor.toolbar.insertFile"),
              insertFileSearchPlaceholder: t("pages.editor.toolbar.insertFileSearchPlaceholder"),
              insertFileEmpty: t("pages.editor.toolbar.insertFileEmpty"),
            }}
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:w-[360px] lg:flex-none lg:shrink-0">
        <PageComments orgId={orgId} pageId={page.id} />
      </div>

      <DeletePageDialog
        orgId={orgId}
        projectId={projectId}
        page={{ id: page.id, title }}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={() => void navigate({ to: "/projects/$projectId/pages", params: { projectId } })}
      />

      <PageVersionHistoryDialog
        orgId={orgId}
        projectId={projectId}
        pageId={page.id}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
      />
    </div>
  );
}
