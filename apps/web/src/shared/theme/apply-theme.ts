import { useThemeStore, type ThemePreference } from "./store";

const media = window.matchMedia("(prefers-color-scheme: dark)");

function resolve(preference: ThemePreference): "light" | "dark" {
  return preference === "system" ? (media.matches ? "dark" : "light") : preference;
}

// Tailwind custom-variant — `&:is(.dark *)` (packages/ui globals.css) — нужен класс на предке
// любого узла; вешаем на <html>, чтобы работало до монтирования React (без FOUC).
function applyClass(preference: ThemePreference) {
  document.documentElement.classList.toggle("dark", resolve(preference) === "dark");
}

// Синхронно, до первого рендера (persist читает localStorage синхронно) — без мигания темы.
// Подписка на стор — реакция на смену выбора; подписка на matchMedia — реакция на смену ОС-темы,
// только пока preference === "system" (иначе явный выбор пользователя не должен переезжать сам).
export function installTheme() {
  applyClass(useThemeStore.getState().theme);

  useThemeStore.subscribe((state) => applyClass(state.theme));

  media.addEventListener("change", () => {
    if (useThemeStore.getState().theme === "system") applyClass("system");
  });
}
