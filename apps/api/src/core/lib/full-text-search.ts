// Общие хелперы полнотекстового поиска (Page.searchText / KBArticle.searchText — CLAUDE.md manual-
// migration points #6/#7): единственная точка, оба модуля используют один и тот же алгоритм —
// не дублируем, это реально общий код, а не преждевременная абстракция под будущее.

/** TipTap/ProseMirror JSON → плоский текст (обходит text-узлы). Не источник истины по форме
 * контента (P3) — производное поле, пересчитывается при каждом save. */
export function extractPlainText(title: string, content: unknown): string {
  const parts: string[] = [title];
  walk(content, parts);
  return parts.join(" ");
}

function walk(node: unknown, parts: string[]): void {
  if (!node || typeof node !== "object") return;
  const obj = node as { text?: unknown; content?: unknown };
  if (typeof obj.text === "string") parts.push(obj.text);
  if (Array.isArray(obj.content)) {
    for (const child of obj.content) walk(child, parts);
  }
}

/** ai-chat.md §3.2 — топ-уровневые блоки (параграфы/заголовки/таблицы верхнего уровня) как
 * ОТДЕЛЬНЫЕ строки, не одна склеенная — чанкер (core/lib/chunk-text.ts) режет по границам блоков,
 * не по символам вслепую. Отдельная функция от extractPlainText (не переиспользует её join(" ")),
 * чтобы не трогать уже протестированный search-путь ради нового потребителя. */
export function extractBlockTexts(content: unknown): string[] {
  if (!content || typeof content !== "object") return [];
  const topLevel = (content as { content?: unknown }).content;
  if (!Array.isArray(topLevel)) return [];
  const blocks: string[] = [];
  for (const block of topLevel) {
    const parts: string[] = [];
    walk(block, parts);
    const text = parts.join(" ").trim();
    if (text) blocks.push(text);
  }
  return blocks;
}

// Каждое слово → префикс-лексема ("word:*"), склеены через "&" (все слова обязательны) — находит
// "жирного" по вводу "жирн" при наборе по мере ввода ('simple'-словарь не стеммирует). Экранирует
// ts_query-спецсимволы (&|!():*), иначе "C++" или "a&b" сломали бы синтаксис запроса на Postgres.
export function toPrefixTsQuery(q: string): string {
  return q
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/[&|!():*]/g, ""))
    .filter(Boolean)
    .map((word) => `${word}:*`)
    .join(" & ");
}
