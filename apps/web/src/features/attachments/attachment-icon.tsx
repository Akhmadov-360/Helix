import { File, FileArchive, FileAudio, FileImage, FileSpreadsheet, FileText, FileVideo } from "lucide-react";

// Иконка по mime-префиксу — вложение не превьюшится (files.md не обещает thumbnails), только тип.
export function AttachmentIcon({ mimeType, className }: { mimeType: string; className?: string }) {
  if (mimeType.startsWith("image/")) return <FileImage className={className} />;
  if (mimeType.startsWith("video/")) return <FileVideo className={className} />;
  if (mimeType.startsWith("audio/")) return <FileAudio className={className} />;
  if (mimeType === "application/pdf" || mimeType.startsWith("text/")) return <FileText className={className} />;
  if (mimeType.includes("spreadsheet") || mimeType.includes("csv") || mimeType.includes("excel"))
    return <FileSpreadsheet className={className} />;
  if (mimeType.includes("zip") || mimeType.includes("compressed") || mimeType.includes("tar"))
    return <FileArchive className={className} />;
  return <File className={className} />;
}
