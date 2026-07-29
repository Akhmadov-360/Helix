import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { AppProviders } from "./app/providers";
import { queryClient } from "./app/query-client";
import { router } from "./app/router";
import { onSessionExpired } from "./shared/api";
import { invalidateSecurityContext } from "./shared/auth/invalidate-session";
import { installI18n } from "./shared/i18n";
import "@fontsource-variable/inter";
import "./index.css";

// Локализованные сообщения валидации zod (глобально, до первого парса).
installI18n();

// Hard logout при неудачном silent-refresh (§8.1, P0-AUTH-FE): shared/api не знает про Router/Query
// (NET-2), поэтому единственный обработчик регистрируется здесь, в app-бутстрапе, а не в клиенте.
onSessionExpired(() => {
  void invalidateSecurityContext(queryClient).then(() => router.navigate({ to: "/login" }));
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
