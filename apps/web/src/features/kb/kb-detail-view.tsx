import { useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { KbArticleResponse, UpdateKbArticleInput } from "@helix/api-schemas";
import { Button, Input, RichTextEditor } from "@helix/ui";
import { Trash2 } from "lucide-react";
import { useCan } from "../../shared/auth/ability";
import { useT } from "../../shared/i18n";
import { DeleteKbArticleDialog } from "./delete-kb-article-dialog";
import { useUpdateKbArticle } from "./mutations";
import { kbArticleQueryOptions } from "./queries";

const AUTOSAVE_DELAY_MS = 1500;
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

  const [title, setTitle] = useState(article.title);
  const [tagsInput, setTagsInput] = useState(article.tags.join(", "));
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<UpdateKbArticleInput>({});

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

  function parseTags(value: string): string[] {
    return [...new Set(value.split(",").map((tagValue) => tagValue.trim()).filter(Boolean))];
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        {canUpdate ? (
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              scheduleSave({ title: e.target.value });
            }}
            aria-label={t("kb.create.label")}
            className="min-w-0 flex-1 bg-transparent text-xl font-semibold outline-none"
          />
        ) : (
          <h1 className="min-w-0 flex-1 truncate text-xl font-semibold">{title}</h1>
        )}

        {status !== "idle" && (
          <span className="shrink-0 text-xs text-muted-foreground">
            {status === "saving" ? t("pages.autosave.saving") : t("pages.autosave.saved")}
          </span>
        )}

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

      {canUpdate ? (
        <Input
          value={tagsInput}
          onChange={(e) => {
            setTagsInput(e.target.value);
            scheduleSave({ tags: parseTags(e.target.value) });
          }}
          placeholder={t("kb.detail.tagsPlaceholder")}
          className="max-w-sm"
        />
      ) : (
        article.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {article.tags.map((tagValue) => (
              <span key={tagValue} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {tagValue}
              </span>
            ))}
          </div>
        )
      )}

      <RichTextEditor
        content={article.content}
        editable={canUpdate}
        onChange={(content) => scheduleSave({ content })}
        placeholder={t("pages.editor.placeholder")}
      />

      <DeleteKbArticleDialog
        orgId={orgId}
        article={{ id: article.id, title }}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={() => void navigate({ to: "/kb" })}
      />
    </div>
  );
}
