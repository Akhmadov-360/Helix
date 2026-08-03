import type { LocalizedName } from "@helix/api-schemas";
import { ensureUniqueKey, generateKeyBase } from "../../core/lib/slug";

// §5 шаги 1–3: пустой слаг (эмодзи "🔥", CJK, "!!!") → fallback "phase".
export function generatePhaseKeyBase(name: LocalizedName): string {
  return generateKeyBase(name, "phase");
}

// §5 шаг 4: коллизия в пределах воркспейса → суффикс-число.
export const ensureUniquePhaseKey = ensureUniqueKey;
