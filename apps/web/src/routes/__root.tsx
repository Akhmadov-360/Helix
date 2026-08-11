import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { Toaster, TooltipProvider } from "@helix/ui";
import { useThemeStore } from "../shared/theme";

// Toaster — здесь, а не в AppShell: анонимные страницы (login/register/forgot-password/
// reset-password) живут вне _authenticated, но тоже вызывают toast() (напр. reset-password-form).
// Раньше он монтировался только в AppShell — тост на анонимной странице тихо не показывался.
// TooltipProvider — тот же приём, один инстанс на всё приложение, не per-фиче (delayDuration=0 —
// дефолт shadcn-компонента, ощущается мгновенным, а не "залипшим" hover'ом).
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: Root,
});

function Root() {
  const theme = useThemeStore((state) => state.theme);
  return (
    <TooltipProvider>
      <Outlet />
      <Toaster theme={theme} />
    </TooltipProvider>
  );
}
