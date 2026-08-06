import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { AppProviders } from "./app/providers";
import { queryClient } from "./app/query-client";
import { router } from "./app/router";
import { onSessionExpired } from "./shared/api";
import { invalidateSecurityContext } from "./shared/auth/invalidate-session";
import { installI18n } from "./shared/i18n";
import { installTheme } from "./shared/theme";
import "@fontsource-variable/inter";
import "./index.css";

// Локализованные сообщения валидации zod (глобально, до первого парса).
installI18n();

// Класс .dark на <html> — до первого рендера, синхронно (persist читает localStorage сразу),
// без мигания темы при загрузке.
installTheme();

// Hard logout при неудачном silent-refresh (§8.1, P0-AUTH-FE): shared/api не знает про Router/Query
// (NET-2), поэтому единственный обработчик регистрируется здесь, в app-бутстрапе, а не в клиенте.
onSessionExpired(() => {
  void invalidateSecurityContext(queryClient).then(() => router.navigate({ to: "/login" }));
});

// bfcache (жест "назад" в браузере) может разморозить СТАРУЮ вкладку прямо из памяти — со старым
// access-token в JS-heap и старым React Query кэшем чужой орги, минуя повторный запуск main.tsx.
// useSwitchOrg уже делает hard-reload на "/" именно из-за похожей гонки (см. её комментарий) —
// bfcache открывает тот же класс бага с другой стороны (назад, не вперёд). pageshow{persisted:true}
// (MDN) — единственный надёжный сигнал "эта страница восстановлена из bfcache, не свежая загрузка".
window.addEventListener("pageshow", (event) => {
  if (event.persisted) window.location.reload();
});

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");

createRoot(rootEl).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
