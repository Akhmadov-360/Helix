import { create } from "zustand";
import { persist } from "zustand/middleware";
import { LOCALES, type Locale } from "@helix/api-schemas";
import { DEFAULT_LOCALE } from "./messages";

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

// Локаль — user-preference (не серверная истина), поэтому persist в localStorage (§3, второй
// легитимный persisted-UI наряду с «последним воркспейсом»). Переключатель локали — слой 4.
export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      locale: DEFAULT_LOCALE,
      setLocale: (locale) => set({ locale }),
    }),
    {
      name: "helix.locale",
      // Мусор из localStorage не должен ронять старт: неизвестная локаль → дефолт.
      merge: (persisted, current) => {
        const p = persisted as Partial<LocaleState> | undefined;
        const locale = p?.locale && LOCALES.includes(p.locale) ? p.locale : current.locale;
        return { ...current, locale };
      },
    },
  ),
);
