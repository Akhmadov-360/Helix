// Детерминированный цвет бейджа по тексту тега (design review: "цветными бейджами уже созданных
// тегов", "визуальная монотонность") — фиксированная палитра из 6 оттенков, хэш строки выбирает
// индекс; один и тот же тег всегда одного цвета, без похода на сервер за "назначенным" цветом.
const PALETTE = [
  "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  "bg-pink-500/15 text-pink-600 dark:text-pink-400",
  "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
] as const;

export function tagColorClass(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length]!;
}
