// board.create.source — свободный текст ("Сайт", "Instagram", но и часто реальные URL/handle'ы
// вроде "t.me/imarat_development"). Линкуем только когда текст СТРУКТУРНО похож на адрес — не
// пытаемся угадывать смысл произвольных слов ("Сайт" остаётся текстом, не мёртвой ссылкой).
const DOMAIN_LIKE = /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i;

export function sourceUrl(source: string): string | null {
  const trimmed = source.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (DOMAIN_LIKE.test(trimmed)) return `https://${trimmed}`;
  return null;
}
