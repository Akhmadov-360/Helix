import mammoth from "mammoth";
import pdfParse from "pdf-parse";

// ai-chat.md §3.1/FR-FILE-3 — только извлекаемые форматы; остальные MIME-типы не индексируются
// вовсе (изображения, архивы и т.п. — EmbeddingChunk для них не создаётся, не "создаётся пустым").
const EXTRACTABLE_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "text/plain",
  "text/markdown",
]);

export function isExtractableMimeType(mimeType: string): boolean {
  return EXTRACTABLE_MIME_TYPES.has(mimeType);
}

/** null = формат не извлекаем (вызывающий код не должен был звать эту функцию — isExtractableMimeType
 * гейтит вызов заранее) либо извлечение не дало текста (пустой/повреждённый файл). */
export async function extractAttachmentText(mimeType: string, buffer: Buffer): Promise<string | null> {
  switch (mimeType) {
    case "application/pdf": {
      const { text } = await pdfParse(buffer);
      return text.trim() || null;
    }
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
      const { value } = await mammoth.extractRawText({ buffer });
      return value.trim() || null;
    }
    case "text/plain":
    case "text/markdown":
      return buffer.toString("utf-8").trim() || null;
    default:
      return null;
  }
}
