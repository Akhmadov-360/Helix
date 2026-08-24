// Единая труба всех форматов импорта: file/paste → HTML string → TipTap JSON. Каждый парсер
// возвращает `{ title, html }` — title извлекается из первого H1/H2/имени файла, html поднимается
// в generateJSON с общим набором расширений (совпадает с RichTextEditor базой). Каждый парсер
// dynamic-import'ит свою lib — deps не попадают в основной bundle, качаются только когда user
// открыл dialog и выбрал формат.

import { generateJSON } from "@tiptap/html";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";

// Расширения для парсинга — минимальный набор, покрывающий большинство внешних форматов
// (headings, lists, links, bold/italic, code, blockquote, tables). Не полное зеркало
// RichTextEditor (mentions/pageLink не имеют смысла при импорте извне — там нет наших id).
const IMPORT_EXTENSIONS = [StarterKit, TableKit.configure({ table: { resizable: false } })];

export interface ParsedPage {
  title: string;
  content: Record<string, unknown>;
}

// Достаём title из первого H1 (или H2 fallback) в HTML — Notion/Google Docs экспортируют так;
// если ни того ни другого нет — берём filename без расширения, а если и нет — null (вызов
// поставит дефолт).
function extractTitleFromHtml(html: string, filenameFallback: string | null): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const h1 = doc.querySelector("h1");
  if (h1?.textContent?.trim()) {
    // Удаляем H1 из body чтобы не дублировался в контенте — title и h1 — одна сущность визуально.
    h1.remove();
    return h1.textContent.trim();
  }
  const h2 = doc.querySelector("h2");
  if (h2?.textContent?.trim()) {
    // H2 оставляем — это подзаголовок, часть контента, а не title (H1 приоритет для «главного»).
    return h2.textContent.trim();
  }
  return filenameFallback ?? "";
}

// Общий финальный шаг всех парсеров: HTML → title + TipTap JSON.
function htmlToPage(html: string, filenameFallback: string | null): ParsedPage {
  const title = extractTitleFromHtml(html, filenameFallback);
  // Пере-парсим уже без H1 (extractTitle его удалил) — DOMParser парсит копию строки, HTML вход
  // не мутируется. Проще: сериализуем DOM обратно после мутации в extractTitleFromHtml.
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const h1 = doc.querySelector("h1");
  if (h1?.textContent?.trim() === title) h1.remove(); // тот же title что нашли — убрать из тела
  const cleanHtml = doc.body.innerHTML;
  const content = generateJSON(cleanHtml, IMPORT_EXTENSIONS) as Record<string, unknown>;
  return { title, content };
}

// ── PLAIN HTML (paste из Google Docs/Notion/браузера, или .html file) ────────────────────────
export function parseHtml(html: string, filenameFallback: string | null = null): ParsedPage {
  return htmlToPage(html, filenameFallback);
}

// ── MARKDOWN (paste или .md file) ─────────────────────────────────────────────────────────────
export async function parseMarkdown(md: string, filenameFallback: string | null = null): Promise<ParsedPage> {
  // Dynamic import — marked в bundle только при реальном использовании.
  const { marked } = await import("marked");
  // gfm=true даёт task-list/tables/strikethrough — стандартный GitHub-flavored Markdown.
  const html = await marked.parse(md, { gfm: true, breaks: false, async: true });
  return htmlToPage(String(html), filenameFallback);
}

// ── DOCX (Word) через mammoth ─────────────────────────────────────────────────────────────────
export async function parseDocx(file: File): Promise<ParsedPage> {
  // Vite резолвит `mammoth` через package.json#browser field: unzip.js подменяется на
  // browser-вариант, node-специфичного fs/streams не тянется. Types берутся из lib/index.d.ts.
  const { default: mammoth } = await import("mammoth");
  const arrayBuffer = await file.arrayBuffer();
  // convertToHtml даёт полу-семантический HTML: <h1>/<p>/<ul>/<table>/<strong>. Форматирование
  // потеряется частично (шрифты, цвета — не переносим), структура сохраняется.
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer });
  return htmlToPage(html, stripExt(file.name));
}

// ── PDF через pdfjs (text-extraction, форматирование теряется) ────────────────────────────────
export async function parsePdf(file: File): Promise<ParsedPage> {
  const pdfjs = await import("pdfjs-dist");
  // Worker: без него pdf.js падает. Vite поддерживает `?worker&url` — импортируем worker-модуль
  // как URL и говорим pdf.js использовать его. GlobalWorkerOptions мутируется на всё приложение,
  // но это OK (единственный потребитель pdf.js — импорт страниц, других мест нет).
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  }
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;
  const paragraphs: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    // Собираем по параграфам — items с транспортным разделителем, склеиваем в один string по y.
    const line = textContent.items.map((it) => ("str" in it ? it.str : "")).join(" ").trim();
    if (line) paragraphs.push(line);
  }
  // PDF не даёт headings иерархию → всё в <p>. Первая строка становится title (fallback имя файла).
  const [first, ...rest] = paragraphs;
  const title = first || stripExt(file.name);
  const html = rest.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n");
  const content = generateJSON(html, IMPORT_EXTENSIONS) as Record<string, unknown>;
  return { title, content };
}

// ── NOTION .zip export → множество страниц ────────────────────────────────────────────────────
// Notion export = ZIP из .html файлов (одна страница на файл). Возвращаем массив ParsedPage;
// caller создаёт N страниц в одном мутационном цикле.
export async function parseNotionZip(file: File): Promise<ParsedPage[]> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(file);
  const results: ParsedPage[] = [];
  const htmlFiles = Object.values(zip.files).filter(
    (entry) => !entry.dir && entry.name.toLowerCase().endsWith(".html"),
  );
  for (const entry of htmlFiles) {
    const html = await entry.async("text");
    results.push(htmlToPage(html, stripExt(entry.name.split("/").pop() ?? entry.name)));
  }
  return results;
}

function stripExt(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? filename : filename.slice(0, dot);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
