import { useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { PageResponse, UpdatePageInput } from "@helix/api-schemas";
import { Button, RichTextEditor } from "@helix/ui";
import { Check, Loader2, Pencil, Trash2 } from "lucide-react";
import { useCan } from "../../shared/auth/ability";
import { useT } from "../../shared/i18n";
import { DeletePageDialog } from "./delete-page-dialog";
import { useUpdatePage } from "./mutations";
import { PageComments } from "./page-comments";
import { pageQueryOptions } from "./queries";

const AUTOSAVE_DELAY_MS = 1200;
type SaveStatus = "idle" | "saving" | "saved";

export function PageDetailView({ orgId, projectId, pageId }: { orgId: string; projectId: string; pageId: string }) {
  const page = useSuspenseQuery(pageQueryOptions(orgId, pageId)).data;
  const canUpdate = useCan("Page.update");
  const canDelete = useCan("Page.delete");

  // key=page.id — переключение на другую страницу ремонтирует редактор с новым начальным
  // содержимым (RichTextEditor читает content один раз при монтировании, см. её комментарий).
  return (
    <PageEditor
      key={page.id}
      orgId={orgId}
      projectId={projectId}
      page={page}
      canUpdate={canUpdate}
      canDelete={canDelete}
    />
  );
}

function PageEditor({
  orgId,
  projectId,
  page,
  canUpdate,
  canDelete,
}: {
  orgId: string;
  projectId: string;
  page: PageResponse;
  canUpdate: boolean;
  canDelete: boolean;
}) {
  const t = useT();
  const navigate = useNavigate();
  const update = useUpdatePage(orgId, projectId, page.id);

  const [title, setTitle] = useState(page.title);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [deleteOpen, setDeleteOpen] = useState(false);
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
    <div className="flex flex-col gap-3">
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
      />

      <PageComments orgId={orgId} pageId={page.id} />

      <DeletePageDialog
        orgId={orgId}
        projectId={projectId}
        page={{ id: page.id, title }}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={() => void navigate({ to: "/projects/$projectId/pages", params: { projectId } })}
      />
    </div>
  );
}
