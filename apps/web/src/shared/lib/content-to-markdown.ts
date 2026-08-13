// Экспорт документа (Page/KBArticle) в Markdown — общий для Pages и KB, оба используют один и тот
// же RichTextEditor и одну и ту же ноду-схему (rich-text-editor.tsx: heading/bold/italic/списки/
// таблица/wiki-ссылки). Не общий TipTap→MD пакет — под КОНКРЕТНЫЙ набор узлов редактора, расширять
// по мере роста набора, не заранее (CLAUDE.md — не создавать структуру спекулятивно).

interface MdNode {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: MdNode[];
  text?: string;
  marks?: { type: string }[];
}

export function contentToMarkdown(doc: unknown): string {
  const root = doc as MdNode | undefined;
  return blocksToMarkdown(root?.content ?? []).trim();
}

function blocksToMarkdown(nodes: MdNode[]): string {
  return nodes
    .map(blockToMarkdown)
    .filter((s) => s.length > 0)
    .join("\n\n");
}

function blockToMarkdown(node: MdNode): string {
  switch (node.type) {
    case "heading": {
      const level = Math.min(Math.max(Number(node.attrs?.level ?? 1), 1), 6);
      return `${"#".repeat(level)} ${inlineToMarkdown(node.content ?? [])}`.trim();
    }
    case "bulletList":
      return (node.content ?? []).map((li) => `- ${listItemToMarkdown(li)}`).join("\n");
    case "orderedList":
      return (node.content ?? []).map((li, i) => `${i + 1}. ${listItemToMarkdown(li)}`).join("\n");
    case "table":
      return tableToMarkdown(node.content ?? []);
    case "paragraph":
      return inlineToMarkdown(node.content ?? []);
    default:
      return inlineToMarkdown(node.content ?? []);
  }
}

// listItem.content — обычно [paragraph, ...вложенные списки] (ProseMirror-схема StarterKit);
// плоско склеиваем в одну строку — вложенные списки без отступа, редкий случай, не стоит усложнения.
function listItemToMarkdown(node: MdNode): string {
  return (node.content ?? [])
    .map(blockToMarkdown)
    .filter((s) => s.length > 0)
    .join(" ")
    .trim();
}

function tableToMarkdown(rows: MdNode[]): string {
  const firstRow = rows[0];
  if (!firstRow) return "";
  const cellsOf = (row: MdNode) => (row.content ?? []).map(cellToMarkdown);
  const header = cellsOf(firstRow);
  const body = rows.slice(1).map(cellsOf);
  const headerLine = `| ${header.join(" | ")} |`;
  const sepLine = `| ${header.map(() => "---").join(" | ")} |`;
  const bodyLines = body.map((cells) => `| ${cells.join(" | ")} |`);
  return [headerLine, sepLine, ...bodyLines].join("\n");
}

function cellToMarkdown(cell: MdNode): string {
  return (cell.content ?? [])
    .map((block) => inlineToMarkdown(block.content ?? []))
    .join(" ")
    .trim();
}

function inlineToMarkdown(nodes: MdNode[]): string {
  return nodes.map(inlineNodeToMarkdown).join("");
}

function inlineNodeToMarkdown(node: MdNode): string {
  if (node.type === "text") {
    const marks = new Set((node.marks ?? []).map((m) => m.type));
    let text = node.text ?? "";
    if (marks.has("bold")) text = `**${text}**`;
    if (marks.has("italic")) text = `*${text}*`;
    return text;
  }
  // Wiki-ссылка (pageLink) / @-упоминание (mention) — обычным Mention-узлом (rich-text-editor.tsx):
  // в markdown как обычный текст лейбла, не как [ссылку](url) — стабильного публичного URL страницы
  // вне приложения нет, фальшивая ссылка была бы хуже, чем просто имя.
  if (node.type === "mention" || node.type === "pageLink") {
    return (node.attrs?.label as string) ?? "";
  }
  if (node.content) return inlineToMarkdown(node.content);
  return "";
}

// Имя файла для .md-экспорта — вырезаем символы, недопустимые в именах файлов на Windows/macOS/Linux
// (общее пересечение), схлопываем пробелы; пустой результат (например, заголовок из одних "/") —
// fallback "document", чтобы download никогда не получил пустое имя.
function sanitizeFilename(title: string): string {
  const cleaned = title.replace(/[/\\:*?"<>|]/g, "").trim();
  return cleaned || "document";
}

// Клиентский Blob-download — без похода на бэкенд, весь контент уже на клиенте (список статей/
// страниц уже возвращает полный content, см. api-schemas). Общая точка для Pages и KB, и для
// списков, и для деталей — 4 вызывающих места делают одно и то же, дублировать незачем.
export function downloadMarkdown(title: string, content: unknown): void {
  const markdown = `# ${title}\n\n${contentToMarkdown(content)}\n`;
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${sanitizeFilename(title)}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
