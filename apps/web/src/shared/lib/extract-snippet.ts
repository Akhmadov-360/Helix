// Сниппет поиска — общий для Pages и KB (оба списка уже получают полный content в ответе, см.
// комментарий у pageResponseSchema/kbArticleResponseSchema), тот же обход TipTap JSON, что
// backend'ный extractPlainText (apps/api/src/core/lib/full-text-search.ts) для searchText.

export function extractPlainText(node: unknown, parts: string[] = []): string {
  if (node && typeof node === "object") {
    const obj = node as { text?: unknown; content?: unknown };
    if (typeof obj.text === "string") parts.push(obj.text);
    if (Array.isArray(obj.content)) obj.content.forEach((child) => extractPlainText(child, parts));
  }
  return parts.join(" ");
}

const SNIPPET_CONTEXT_CHARS = 40;

// Окно текста вокруг первого совпадения с query, не весь документ — null, если совпадение только
// в title (тогда сниппет избыточен, title уже подсвечен отдельно highlightMatch).
export function extractSnippet(content: unknown, query: string): string | null {
  const q = query.trim();
  if (!q) return null;
  const text = extractPlainText(content);
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return null;
  const start = Math.max(0, idx - SNIPPET_CONTEXT_CHARS);
  const end = Math.min(text.length, idx + q.length + SNIPPET_CONTEXT_CHARS);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}

const EXCERPT_CHARS = 140;

// Превью карточки без активного поиска (design review: "мёртвая пустота в карточке, нет
// сниппета") — просто начало текста, не привязано к совпадению. null, если документ пуст.
export function extractExcerpt(content: unknown): string | null {
  const text = extractPlainText(content).trim();
  if (!text) return null;
  return text.length > EXCERPT_CHARS ? `${text.slice(0, EXCERPT_CHARS).trim()}…` : text;
}
