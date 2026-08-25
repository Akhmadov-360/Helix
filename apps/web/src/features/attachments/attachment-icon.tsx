import { File, FileArchive, FileAudio, FileImage, FileSpreadsheet, FileText, FileVideo } from "lucide-react";
import { cn } from "@helix/ui";

// Более дробная классификация, чем attachment-category.ts (там 4 фильтр-бакета) — здесь красим
// иконку под конкретный тип файла (Figma: PDF/архив/картинка — разные акцентные цвета), не только
// под фильтр-группу.
type FileKind = "image" | "pdf" | "spreadsheet" | "archive" | "video" | "audio" | "document" | "other";

function fileKind(mimeType: string): FileKind {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.includes("spreadsheet") || mimeType.includes("csv") || mimeType.includes("excel"))
    return "spreadsheet";
  if (mimeType.includes("zip") || mimeType.includes("compressed") || mimeType.includes("tar")) return "archive";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("text/") || mimeType.includes("word") || mimeType.includes("document")) return "document";
  return "other";
}

const KIND_STYLE: Record<FileKind, { icon: typeof File; tone: string }> = {
  image: { icon: FileImage, tone: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  pdf: { icon: FileText, tone: "bg-rose-500/10 text-rose-600 dark:text-rose-400" },
  spreadsheet: { icon: FileSpreadsheet, tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  archive: { icon: FileArchive, tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  video: { icon: FileVideo, tone: "bg-purple-500/10 text-purple-600 dark:text-purple-400" },
  audio: { icon: FileAudio, tone: "bg-pink-500/10 text-pink-600 dark:text-pink-400" },
  document: { icon: FileText, tone: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
  other: { icon: File, tone: "bg-muted text-muted-foreground" },
};

// Цветной квадрат — сам себе media-обёртка (не кладём внутрь AttachmentMedia primitive: список
// файлов теперь плоский divide-y, не карточки из packages/ui/attachment.tsx).
export function AttachmentIcon({ mimeType, className }: { mimeType: string; className?: string }) {
  const { icon: Icon, tone } = KIND_STYLE[fileKind(mimeType)];
  return (
    <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", tone, className)}>
      <Icon className="h-4 w-4" />
    </div>
  );
}
