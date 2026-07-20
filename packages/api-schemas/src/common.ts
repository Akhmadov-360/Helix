import { z } from "zod";

// ─────────────────────────────── Response envelope ─────────────────────────
// Все ответы API обёрнуты в { success, data, timestamp } (CLAUDE.md → API-конвенции).
// Фронт разворачивает `.data`. Тип объявлен ЗДЕСЬ — не переобъявлять по приложениям.

/**
 * Factory: оборачивает схему полезной нагрузки в конверт ответа.
 * Generic-обёртки в Zod выражаются функцией (нельзя параметризовать сам объект схемы).
 */
export function apiResponseSchema<T extends z.ZodTypeAny>(data: T) {
  return z.object({
    success: z.literal(true),
    data,
    timestamp: z.iso.datetime(),
  });
}

/** Envelope-тип для кода, который не выводит его из конкретной схемы. */
export interface ApiResponse<T> {
  success: true;
  data: T;
  timestamp: string;
}

// ─────────────────────────────── LocalizedName ─────────────────────────────
// jsonb {uz?, ru?, en?}. Никогда не рендерить напрямую — только через localize() (P1).

export const LOCALES = ["uz", "ru", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const localizedNameSchema = z
  .object({
    uz: z.string().optional(),
    ru: z.string().optional(),
    en: z.string().optional(),
  })
  // Хотя бы одно значение должно быть задано — иначе рендерить нечего.
  .refine((v) => LOCALES.some((l) => v[l] !== undefined && v[l] !== ""), {
    message: "LocalizedName must contain at least one locale value",
  });

export type LocalizedName = z.infer<typeof localizedNameSchema>;

/**
 * Разрешает LocalizedName в строку для рендера.
 * Порядок: запрошенная локаль → остальные в порядке LOCALES → пустая строка.
 * Единственная санкционированная точка чтения LocalizedName (P1).
 */
export function localize(value: LocalizedName, locale: Locale): string {
  const preferred = value[locale];
  if (preferred !== undefined && preferred !== "") return preferred;

  for (const l of LOCALES) {
    const candidate = value[l];
    if (candidate !== undefined && candidate !== "") return candidate;
  }
  return "";
}
