import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";

/**
 * Единственная точка использования fractional-indexing в рантайме (как phase-key.ts).
 * before/after — соседние ранги (null = край колонки). Бросает, если before >= after
 * (стейл-соседи, §4.5) — вызывающий превращает в 409.
 */
export function rankBetween(before: string | null, after: string | null): string {
  return generateKeyBetween(before, after);
}

/** Плотная сетка из n ранков — для рекомпакции фазы (§4.4). */
export function denseRanks(count: number): string[] {
  return generateNKeysBetween(null, null, count);
}
