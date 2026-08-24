import { useRef, useState } from "react";
import { FileUp, Loader2, Upload } from "lucide-react";
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
import { useT } from "../../../shared/i18n";
import { useCreatePage } from "../mutations";
import {
  parseDocx,
  parseHtml,
  parseMarkdown,
  parseNotionZip,
  parsePdf,
  type ParsedPage,
} from "./parse";

type ImportMode = "paste" | "file";
// File-format вычисляется по расширению — dialog не спрашивает пользователя, откуда файл;
// парсер выбирается автоматом. Notion-.zip определяется по extension (пользователю очевидно, что
// это .zip → «Notion export», отдельного tab'а не нужно).
const ACCEPT = ".md,.markdown,.html,.htm,.docx,.pdf,.zip";

// «Импорт извне» — dialog с двумя режимами:
//  - paste: textarea для Markdown/HTML (autodetect: содержит `<` в первой значимой строке → HTML,
//    иначе Markdown; grader'ы: HTML-паст из Google Docs всегда с <meta>, MD никогда с '<');
//  - file: <input type=file> + drag&drop; поддержка .md/.html/.docx/.pdf/.zip, ветвление по ext.
// После парсинга — POST /v1/projects/:id/pages для каждой странички (Notion-zip даёт массив).
export function ImportPageDialog({
  orgId,
  projectId,
  open,
  onOpenChange,
}: {
  orgId: string;
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const create = useCreatePage(orgId, projectId);
  const [mode, setMode] = useState<ImportMode>("file");
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function commitPages(pages: ParsedPage[]) {
    if (pages.length === 0) {
      toast.error(t("pages.import.error.empty"));
      return;
    }
    // Sequential (не Promise.all) — не долбить бэк N параллельными POST при 20+ страницах Notion.
    // Partial-failure tracking: если 15 из 20 создались, а 16-я упала — оставшиеся 4 всё равно
    // не пытаемся создать (сеть уже кривая), но сообщаем «Импортировано 15 из 20» вместо
    // generic-ошибки. Иначе юзер думает «ничего не создалось» и жмёт retry → 15 дублей.
    let created = 0;
    let error: unknown = null;
    for (const page of pages) {
      try {
        await create.mutateAsync({
          title: page.title || t("pages.title.placeholder"),
          content: page.content,
        });
        created++;
      } catch (err) {
        error = err;
        break; // сеть/сервер кривые — прекращаем, не спамим ретраями
      }
    }
    if (error && created === 0) {
      // Ничего не создалось — уже показан toast из useCreatePage.onError (through error mapping),
      // здесь дублировать не надо. Diалог оставляем открытым: юзер может исправить + retry.
      console.error("[import] all pages failed", error);
      return;
    }
    if (error && created > 0) {
      // Партиал — user must know exact N; повторный импорт того же зипа даст дубли на первых N.
      toast.warning(t("pages.import.partial", { created: String(created), total: String(pages.length) }));
      reset();
      onOpenChange(false);
      return;
    }
    toast.success(t("pages.import.success", { count: pages.length }));
    reset();
    onOpenChange(false);
  }

  function reset() {
    setPasted("");
    setMode("file");
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handlePasteSubmit() {
    if (!pasted.trim()) return;
    setBusy(true);
    try {
      const trimmed = pasted.trimStart();
      // «Похоже на HTML» — быстрый эвристический тест: начинается с '<' И есть закрывающий tag.
      // Google Docs paste всегда обёрнут в <meta>/<b> (для сохранения стилей). MD — 0 углов.
      const looksHtml = trimmed.startsWith("<") && /<\/?[a-z][^>]*>/i.test(trimmed);
      const parsed = looksHtml ? parseHtml(pasted) : await parseMarkdown(pasted);
      await commitPages([parsed]);
    } catch (err) {
      // Не показываем raw error пользователю — только logging + generic message. Форматы
      // непредсказуемо ломаются (broken HTML, unknown MD extension), пользователь ничего с
      // текстом ошибки не сделает.
      console.error("[import] paste failed", err);
      toast.error(t("pages.import.error.parse"));
    } finally {
      setBusy(false);
    }
  }

  async function handleFile(file: File) {
    setBusy(true);
    try {
      const name = file.name.toLowerCase();
      let pages: ParsedPage[];
      if (name.endsWith(".md") || name.endsWith(".markdown")) {
        pages = [await parseMarkdown(await file.text(), stripExt(file.name))];
      } else if (name.endsWith(".html") || name.endsWith(".htm")) {
        pages = [parseHtml(await file.text(), stripExt(file.name))];
      } else if (name.endsWith(".docx")) {
        pages = [await parseDocx(file)];
      } else if (name.endsWith(".pdf")) {
        pages = [await parsePdf(file)];
      } else if (name.endsWith(".zip")) {
        pages = await parseNotionZip(file);
      } else {
        toast.error(t("pages.import.error.unsupportedFormat"));
        return;
      }
      await commitPages(pages);
    } catch (err) {
      console.error("[import] file failed", err);
      toast.error(t("pages.import.error.parse"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) {
          if (!next) reset();
          onOpenChange(next);
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("pages.import.title")}</DialogTitle>
          <DialogDescription>{t("pages.import.description")}</DialogDescription>
        </DialogHeader>

        <div role="tablist" className="flex gap-1 rounded-md bg-muted p-1">
          <TabButton active={mode === "file"} onClick={() => setMode("file")}>
            {t("pages.import.tab.file")}
          </TabButton>
          <TabButton active={mode === "paste"} onClick={() => setMode("paste")}>
            {t("pages.import.tab.paste")}
          </TabButton>
        </div>

        {mode === "file" ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files[0];
              if (file) void handleFile(file);
            }}
            onClick={() => !busy && inputRef.current?.click()}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 text-center transition-colors",
              dragOver ? "border-accent bg-accent/5" : "border-border hover:bg-muted/40",
              busy && "pointer-events-none opacity-60",
            )}
          >
            {busy ? (
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            ) : (
              <FileUp className="h-8 w-8 text-muted-foreground" />
            )}
            <div className="text-sm">
              <p className="font-medium">{t("pages.import.dropzone.title")}</p>
              <p className="text-muted-foreground">{t("pages.import.dropzone.formats")}</p>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <textarea
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder={t("pages.import.paste.placeholder")}
              disabled={busy}
              className="min-h-[240px] w-full rounded-md border border-input bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            />
            <p className="text-xs text-muted-foreground">{t("pages.import.paste.hint")}</p>
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => !busy && onOpenChange(false)}
            disabled={busy}
          >
            {t("pages.import.cancel")}
          </Button>
          {mode === "paste" && (
            <Button type="button" onClick={handlePasteSubmit} disabled={busy || !pasted.trim()}>
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              {t("pages.import.submit")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function stripExt(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? name : name.slice(0, dot);
}
