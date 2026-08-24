// Экспорт документа (Page/KBArticle) в разные форматы. Все ветки сходятся на промежуточном
// формате — HTML (полученный из TipTap doc через generateHTML), дальше:
//   MD    — уже покрыт content-to-markdown.ts (переиспользуется, независимая труба).
//   HTML  — прямой blob.
//   DOCX  — html-docx-js-typescript оборачивает HTML в OOXML.
//   PDF   — window.print() с print-стилями; user'у остаётся выбрать "Save as PDF" в системном
//           диалоге. Native path — селектируемый текст, реальный layout, никакой библиотеки.
//           Trade-off: extra клик в диалоге; альтернатива (jspdf+html2canvas) даёт растровый PDF
//           без selectable text — хуже качества, больше bundle.

import { generateHTML } from "@tiptap/html";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";

// Тот же набор, что import/parse.ts — round-trip совместимость (imported HTML → JSON → exported HTML).
const EXPORT_EXTENSIONS = [StarterKit, TableKit.configure({ table: { resizable: false } })];

function sanitizeFilename(title: string): string {
  const cleaned = title.replace(/[/\\:*?"<>|]/g, "").trim();
  return cleaned || "document";
}

function contentToHtml(title: string, content: unknown): string {
  const body = generateHTML(content as Record<string, unknown>, EXPORT_EXTENSIONS);
  const escapedTitle = title
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  // Standalone document с базовыми стилями — открывается напрямую в браузере, не выглядит raw.
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapedTitle}</title>
<style>
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; color: #111827; }
  h1, h2, h3 { line-height: 1.25; }
  h1 { font-size: 2rem; margin-bottom: 1rem; }
  p { margin: 0.75em 0; }
  ul, ol { padding-left: 1.5rem; }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; }
  th, td { border: 1px solid #d1d5db; padding: 6px 10px; text-align: left; }
  th { background: #f3f4f6; }
</style>
</head>
<body>
<h1>${escapedTitle}</h1>
${body}
</body>
</html>`;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadHtml(title: string, content: unknown): void {
  const html = contentToHtml(title, content);
  downloadBlob(new Blob([html], { type: "text/html;charset=utf-8" }), `${sanitizeFilename(title)}.html`);
}

export async function downloadDocx(title: string, content: unknown): Promise<void> {
  const html = contentToHtml(title, content);
  // Dynamic import: 200KB библиотека грузится только когда user запустил export → docx, не в
  // основном bundle. Возвращает Blob (в браузере) или Buffer (в node); мы всегда браузер.
  const { asBlob } = await import("html-docx-js-typescript");
  // Тип пакета объявляет `Blob | Buffer`, но в браузере всегда Blob (Buffer — только в node
  // ветке той же lib). Приводим к unknown → Blob, TS теряет node-ветку типа целиком.
  const blob = (await asBlob(html)) as unknown as Blob;
  downloadBlob(blob, `${sanitizeFilename(title)}.docx`);
}

// PDF через system print dialog — open new window с только контентом и стилями для печати, вызов
// window.print(). User выбирает "Save as PDF" (все современные ОС + браузеры это дают). Плюсы:
// native quality, selectable text, real layout; минус: extra клик в диалоге.
export function downloadPdf(title: string, content: unknown): void {
  const html = contentToHtml(title, content);
  const printWindow = window.open("", "_blank", "width=800,height=1000");
  if (!printWindow) return; // popup blocked — nothing we can do silently, caller ловит toast
  printWindow.document.write(html);
  printWindow.document.close();
  // Ждём загрузки шрифтов/стилей — 100мс достаточно для наших inline-styles.
  printWindow.addEventListener("load", () => {
    printWindow.print();
    // Не закрываем автоматически — user может решить отменить печать; закрытие вручную.
  });
}
