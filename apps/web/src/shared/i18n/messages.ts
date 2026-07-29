import type { Locale } from "@helix/api-schemas";
import ru from "./locales/ru.json";
import en from "./locales/en.json";
import uz from "./locales/uz.json";

// Каноничный каталог (ru) задаёт множество ключей; остальные локали обязаны его повторить (Messages).
// UI-микрокопия живёт в JSON per-locale (не хардкод по компонентам). Доменные строки (LocalizedName) —
// отдельно, через localize() (§6.5): два симметричных in-house механизма, без i18n-библиотеки (§1.2).
export type MessageKey = keyof typeof ru;
export type Messages = Record<MessageKey, string>;

export const DEFAULT_LOCALE: Locale = "ru";
const catalogs: Record<Locale, Messages> = { ru, en: en as Messages, uz: uz as Messages };

type Params = Record<string, string | number>;

function format(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    params[key] === undefined ? `{${key}}` : String(params[key]),
  );
}

// Ключ обязан существовать в каноне → нет «немого» пропуска строки; при отсутствии в локали
// откатываемся на DEFAULT_LOCALE (частичный перевод не ломает UI).
export function translate(locale: Locale, key: MessageKey, params?: Params): string {
  const template = catalogs[locale][key] ?? catalogs[DEFAULT_LOCALE][key];
  return format(template, params);
}
