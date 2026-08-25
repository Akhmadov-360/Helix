import { useState } from "react";
import { Download, FileCode, FileText, FileType, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@helix/ui";
import { useT, type MessageKey } from "../../shared/i18n";
import { downloadMarkdown } from "../../shared/lib/content-to-markdown";
import { downloadDocx, downloadHtml, downloadPdf } from "../../shared/lib/content-export";

type Format = "md" | "html" | "docx" | "pdf";

const FORMATS: readonly {
  key: Format;
  icon: typeof FileText;
  labelKey: MessageKey;
  hintKey: MessageKey;
}[] = [
  { key: "md", icon: FileText, labelKey: "pages.export.md", hintKey: "pages.export.md.hint" },
  { key: "html", icon: FileCode, labelKey: "pages.export.html", hintKey: "pages.export.html.hint" },
  { key: "docx", icon: FileType, labelKey: "pages.export.docx", hintKey: "pages.export.docx.hint" },
  { key: "pdf", icon: FileType, labelKey: "pages.export.pdf", hintKey: "pages.export.pdf.hint" },
];

// Single-select export (design review, Stitch-скрин): один формат за раз, радио вместо чекбоксов.
// Раньше был multi-select — экономил повторное открытие диалога ради «и .docx, и .pdf», но это
// частный кейс; для типового «скачать один файл» радио читается однозначнее (выбор, не список
// вкл/выкл), решили в пользу простоты.
export function ExportPageDialog({
  title,
  content,
  open,
  onOpenChange,
}: {
  title: string;
  content: unknown;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  // Дефолт — MD (самый частый). Хранение в useState — простой mutable-выбор, ре-инициализация на
  // каждое открытие через key на Dialog не нужна, у нас нет per-page состояния кроме этого.
  const [selected, setSelected] = useState<Format>("md");
  const [busy, setBusy] = useState(false);

  async function handleExport() {
    setBusy(true);
    try {
      // downloadDocx — единственный async вариант (html-docx-js-typescript), остальные синхронные.
      if (selected === "md") downloadMarkdown(title, content);
      else if (selected === "html") downloadHtml(title, content);
      else if (selected === "docx") await downloadDocx(title, content);
      else downloadPdf(title, content);
      toast.success(t("pages.export.success"));
      onOpenChange(false);
    } catch (err) {
      console.error("[export] failed", err);
      toast.error(t("pages.export.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("pages.export.title")}</DialogTitle>
          <DialogDescription>{t("pages.export.description")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1" role="radiogroup" aria-label={t("pages.export.title")}>
          {FORMATS.map(({ key, icon: Icon, labelKey, hintKey }) => {
            const checked = selected === key;
            return (
              <label
                key={key}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-md border border-transparent px-3 py-2 transition-colors hover:bg-muted",
                  checked && "border-border bg-muted/60",
                )}
              >
                <input
                  type="radio"
                  name="export-format"
                  checked={checked}
                  onChange={() => setSelected(key)}
                  disabled={busy}
                  className="h-4 w-4 shrink-0 accent-primary"
                />
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{t(labelKey)}</p>
                  <p className="text-xs text-muted-foreground">{t(hintKey)}</p>
                </div>
              </label>
            );
          })}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => !busy && onOpenChange(false)}
            disabled={busy}
          >
            {t("pages.import.cancel")}
          </Button>
          <Button type="button" onClick={handleExport} disabled={busy}>
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            {t("pages.export.download")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
