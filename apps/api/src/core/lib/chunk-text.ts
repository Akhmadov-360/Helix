// ai-chat.md §3.2 — "~500 токенов на чанк, overlap ~50 токенов (границы по параграфам, не по
// символам вслепую)". Слова, не токены — нет токенайзера конкретной embedding-модели под рукой
// (и не должно быть: чанкер провайдер-агностичен, ai-chat.md §5), слова — разумное приближение,
// тот же порядок величины (для латиницы/кириллицы ~0.7-1 слово на токен).
const CHUNK_SIZE_WORDS = 500;
const CHUNK_OVERLAP_WORDS = 50;

/**
 * Режет предварительно разбитые на блоки (см. core/lib/full-text-search.ts extractBlockTexts,
 * или параграфы attachment-текста) строки на чанки ~CHUNK_SIZE_WORDS слов с overlap в
 * CHUNK_OVERLAP_WORDS слов между соседними чанками — не рвёт блок пополам, если он укладывается
 * целиком, но никогда не пропускает контент, если один блок сам длиннее лимита (хард-сплит внутри
 * него, редкий случай — гигантский параграф без переносов).
 */
export function chunkBlocks(blocks: string[]): string[] {
  const chunks: string[] = [];
  let current: string[] = [];

  const flush = () => {
    if (current.length > 0) chunks.push(current.join(" "));
  };

  for (const block of blocks) {
    const words = block.split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;

    if (words.length > CHUNK_SIZE_WORDS) {
      flush();
      current = [];
      const step = CHUNK_SIZE_WORDS - CHUNK_OVERLAP_WORDS;
      for (let i = 0; i < words.length; i += step) {
        chunks.push(words.slice(i, i + CHUNK_SIZE_WORDS).join(" "));
      }
      continue;
    }

    if (current.length + words.length > CHUNK_SIZE_WORDS && current.length > 0) {
      flush();
      current = current.slice(-CHUNK_OVERLAP_WORDS);
    }
    current.push(...words);
  }
  flush();
  return chunks;
}

/** Attachment-текст (plain/pdf/docx) не приходит уже разбитым на блоки, как TipTap-контент —
 * делим по пустым строкам (тот же эвристический эквивалент "параграфа"). */
export function splitIntoBlocks(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
}
