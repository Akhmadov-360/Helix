import type { LocalizedName } from "@helix/api-schemas";
import { ensureUniqueKey, generateKeyBase } from "../../core/lib/slug";

// custom-fields.md §3: тот же алгоритм, что Phase.key (переиспользуем core/lib/slug) — не
// пишем новый. Fallback "field" — единственное отличие от Phase.
export function generateFieldKeyBase(label: LocalizedName): string {
  return generateKeyBase(label, "field");
}

export const ensureUniqueFieldKey = ensureUniqueKey;
