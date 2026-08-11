import { useEffect, useState } from "react";
import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@helix/ui";
import { Download } from "lucide-react";
import { useT } from "../../shared/i18n";
import { fetchDownloadUrl } from "./mutations";

interface PreviewTarget {
  id: string;
  filename: string;
  mimeType: string;
}

type PreviewState =
  | { status: "loading" }
  | { status: "ready"; url: string; text?: string }
  | { status: "error" };

function isPreviewable(mimeType: string): boolean {
  return mimeType.startsWith("image/") || mimeType.startsWith("text/") || mimeType === "application/pdf";
}

// files.md §5 — открывается по клику на карточку (AttachmentTrigger). disposition=inline на
// download-url (не "attachment") — файл рендерится тут же, не запускает скачивание на диск;
// реальное скачивание — отдельная явная кнопка ("Скачать" ниже), тот же принцип разделения, что
// code-review отметил ("клик по карточке ≠ скачивание").
export function AttachmentPreviewDialog({
  projectId,
  attachment,
  open,
  onOpenChange,
  onDownload,
}: {
  projectId: string;
  attachment: PreviewTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDownload: (attachmentId: string) => void;
}) {
  const t = useT();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="truncate">{attachment?.filename}</DialogTitle>
        </DialogHeader>

        <div className="flex max-h-[70vh] min-h-32 items-center justify-center overflow-auto rounded-md bg-muted/30">
          {/* key=attachment.id — при смене цели монтируется заново, состояние стартует с "loading"
              само по себе (initial state), без императивного сброса setState внутри эффекта. */}
          {open && attachment && <PreviewBody key={attachment.id} projectId={projectId} attachment={attachment} />}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => attachment && onDownload(attachment.id)}>
            <Download className="mr-2 h-4 w-4" />
            {t("attachments.list.download")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreviewBody({ projectId, attachment }: { projectId: string; attachment: PreviewTarget }) {
  const t = useT();
  const [state, setState] = useState<PreviewState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const url = await fetchDownloadUrl(projectId, attachment.id, "inline");
        if (cancelled) return;
        if (attachment.mimeType.startsWith("text/")) {
          const res = await fetch(url);
          const text = await res.text();
          if (cancelled) return;
          setState({ status: "ready", url, text });
        } else {
          setState({ status: "ready", url });
        }
      } catch {
        if (!cancelled) setState({ status: "error" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [attachment.id, attachment.mimeType, projectId]);

  if (state.status === "loading") {
    return <p className="p-8 text-sm text-muted-foreground">{t("attachments.preview.loading")}</p>;
  }
  if (state.status === "error") {
    return <p className="p-8 text-sm text-destructive">{t("attachments.error.unexpected")}</p>;
  }
  if (!isPreviewable(attachment.mimeType)) {
    return <p className="p-8 text-center text-sm text-muted-foreground">{t("attachments.preview.unsupported")}</p>;
  }
  return <PreviewContent attachment={attachment} state={state} />;
}

function PreviewContent({ attachment, state }: { attachment: PreviewTarget; state: PreviewState & { status: "ready" } }) {
  if (attachment.mimeType.startsWith("image/")) {
    return <img src={state.url} alt={attachment.filename} className="max-h-[70vh] max-w-full object-contain" />;
  }
  if (attachment.mimeType === "application/pdf") {
    return <iframe src={state.url} className="h-[70vh] w-full" title={attachment.filename} />;
  }
  return <pre className="max-h-[70vh] w-full overflow-auto whitespace-pre-wrap p-4 text-sm">{state.text}</pre>;
}
