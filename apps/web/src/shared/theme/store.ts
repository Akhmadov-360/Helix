import { create } from "zustand";
import { persist } from "zustand/middleware";

export const THEMES = ["light", "dark", "system"] as const;
export type ThemePreference = (typeof THEMES)[number];

interface ThemeState {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
}

// Тема — user-preference (не серверная истина), persist в localStorage — тот же паттерн, что
// useLocaleStore (shared/i18n/store.ts). "system" — валидное значение (не резолвится тут в
// light/dark), резолв — в apply-theme.ts, единственном месте, которое трогает DOM/matchMedia.
export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: "system",
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: "helix.theme",
      // Мусор из localStorage не должен ронять старт: неизвестное значение → дефолт.
      merge: (persisted, current) => {
        const p = persisted as Partial<ThemeState> | undefined;
        const theme = p?.theme && THEMES.includes(p.theme) ? p.theme : current.theme;
        return { ...current, theme };
      },
    },
  ),
);
