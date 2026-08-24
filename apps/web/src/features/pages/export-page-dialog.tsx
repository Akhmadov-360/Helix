import { useState } from "react";
import { Download, FileCode, FileText, FileType, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Button,
  Checkbox,
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

// Multi-select export: юзер отмечает нужные форматы (или все сразу), нажимает «Экспорт» — все
// выбранные файлы скачиваются последовательно. Один клик по одному пункту в kebab заменяет
// прежний dropdown из четырёх строк — тот пункт-меню плодил визуальный шум и не давал экспорт
// нескольких форматов за раз (типичный запрос: «отправить клиенту и .docx, и .pdf»).
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
  // Дефолт — MD включён (самый частый), остальные пустые. Хранение в useState (не useMemo/effect)
  // — простая mutable-selection, ре-инициализация на каждое открытие через key на Dialog не
  // нужна, у нас нет per-page состояния кроме этого.
  const [selected, setSelected] = useState<Set<Format>>(() => new Set<Format>(["md"]));
  const [busy, setBusy] = useState(false);

  function toggle(key: Format) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleExport() {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      // Sequential — синхронные (md/html/pdf) и async (docx) в одном порядке; parallel порой
      // ломает браузерные download-cascade (Chrome throttling при >5 одновременных).
      if (selected.has("md")) downloadMarkdown(title, content);
      if (selected.has("html")) downloadHtml(title, content);
      if (selected.has("docx")) await downloadDocx(title, content);
      if (selected.has("pdf")) downloadPdf(title, content);
      toast.success(t("pages.export.success", { count: selected.size }));
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

        <div className="flex flex-col gap-1">
          {FORMATS.map(({ key, icon: Icon, labelKey, hintKey }) => {
            const checked = selected.has(key);
            return (
              <label
                key={key}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-md border border-transparent px-3 py-2 transition-colors hover:bg-muted",
                  checked && "border-border bg-muted/60",
                )}
              >
                <Checkbox checked={checked} onCheckedChange={() => toggle(key)} disabled={busy} />
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
          <Button type="button" onClick={handleExport} disabled={busy || selected.size === 0}>
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            {t("pages.export.submit", { count: selected.size })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
