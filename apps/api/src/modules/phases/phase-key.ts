import { localize, type LocalizedName } from "@helix/api-schemas";

const CYRILLIC_MAP: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
  х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

function slugify(input: string): string {
  const translit = [...input.toLowerCase()].map((ch) => CYRILLIC_MAP[ch] ?? ch).join("");
  return translit
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// §5 шаги 1–3: en → первый непустой язык (через localize) → слаг; пустой результат
// (эмодзи "🔥", CJK, "!!!") → fallback "phase". Инвариант: никогда не пустая строка.
export function generatePhaseKeyBase(name: LocalizedName): string {
  return slugify(localize(name, "en")) || "phase";
}

// §5 шаг 4: коллизия в пределах воркспейса → суффикс-число (key остаётся читаемым,
// не cuid — на него смотрят в автоматизациях). Инвариант: уникален среди taken.
export function ensureUniquePhaseKey(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}
