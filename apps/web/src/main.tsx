import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { AppProviders } from "./app/providers";
import { router } from "./app/router";
import { installI18n } from "./shared/i18n";
import "@fontsource-variable/inter";
import "./index.css";

// Локализованные сообщения валидации zod (глобально, до первого парса).
installI18n();

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");

createRoot(rootEl).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
