import { localize, type LocalizedName } from "@helix/api-schemas";
import { useLocaleStore } from "../i18n";

// §6.5: локализация домена (LocalizedName) — отдельно от UI-микрокопии (useT). Единая точка чтения
// на render-границе (P1) — компоненты не читают {uz,ru,en} напрямую.
export function useLocalize(): (value: LocalizedName) => string {
  const locale = useLocaleStore((state) => state.locale);
  return (value: LocalizedName) => localize(value, locale);
}
