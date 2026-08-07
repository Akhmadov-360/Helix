import { createFileRoute, Link, Outlet, redirect, useLocation } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@helix/ui";
import { getAccessToken } from "../shared/api";
import { useT, LocaleSwitcher } from "../shared/i18n";
import { ThemeToggle } from "../shared/theme";
import { BrandLogo } from "../app/brand/logo";

// Общий split-screen каркас для login/register/forgot-password/reset-password (pathless layout,
// как _authenticated.tsx) — редирект уже вошедших вынесен сюда из 4 копий в детях (было
// дублировано дословно в каждом route-файле).
export const Route = createFileRoute("/_auth")({
  beforeLoad: () => {
    if (getAccessToken() !== null) throw redirect({ to: "/" });
  },
  component: AuthLayout,
});

function AuthLayout() {
  const t = useT();
  const pathname = useLocation({ select: (location) => location.pathname });
  // Промо-панель слева на login/forgot/reset, справа только на register (§2 задания) —
  // "форма всегда напротив" читается как согласованный swap, а не рандомная асимметрия.
  const isRegister = pathname === "/register";

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background p-4 sm:p-6">
      <div className="relative grid w-full max-w-5xl grid-cols-1 overflow-hidden rounded-3xl shadow-2xl lg:min-h-[620px] lg:grid-cols-2">
        {/* Картинка — сплошной фон под ВСЕЙ карточкой (не своя половина колонки), форма лежит
            поверх него отдельным слоем со скруглением только на внутреннем углу — на стыке виден
            изгиб фона, а не жёсткий шов (референс: два внахлёст слоя, не единая плита с разрезом). */}
        <div className="absolute inset-0 hidden lg:block">
          <PromoPanel side={isRegister ? "right" : "left"} />
        </div>

        {/* Пустой grid-track держит раскладку 1fr/1fr — сам невидим, картинка под ним видна как есть */}
        <div className={cn("hidden lg:block", isRegister ? "lg:order-2" : "lg:order-1")} aria-hidden="true" />

        <motion.div
          layout
          transition={{ duration: 0.3, ease: "easeInOut" }}
          className={cn(
            "relative z-10 flex flex-col gap-6 bg-card p-8 sm:p-10",
            isRegister ? "lg:order-1 lg:rounded-r-[3.5rem]" : "lg:order-2 lg:rounded-l-[3.5rem]",
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <BrandLogo />
            <QuickSwitch pathname={pathname} />
          </div>

          <div className="flex flex-1 items-center py-6">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={pathname}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="w-full"
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="flex items-center justify-end gap-1">
            <ThemeToggle />
            <LocaleSwitcher />
          </div>
        </motion.div>
      </div>
    </div>
  );

  function QuickSwitch({ pathname }: { pathname: string }) {
    if (pathname === "/login") {
      return (
        <p className="text-sm text-muted-foreground">
          {t("login.noAccount")}{" "}
          <Link to="/register" className="font-medium text-foreground underline underline-offset-4">
            {t("login.signUp")}
          </Link>
        </p>
      );
    }
    if (pathname === "/register") {
      return (
        <p className="text-sm text-muted-foreground">
          {t("register.hasAccount")}{" "}
          <Link to="/login" className="font-medium text-foreground underline underline-offset-4">
            {t("register.signIn")}
          </Link>
        </p>
      );
    }
    return null;
  }
}

function PromoPanel({ side }: { side: "left" | "right" }) {
  const t = useT();
  return (
    <div
      className="relative h-full w-full bg-cover bg-center"
      style={{ backgroundImage: "url(/img/abstract_gradient.jpg)" }}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/10" aria-hidden="true" />
      <div
        className={cn(
          "absolute inset-y-0 flex w-1/2 flex-col justify-end p-10 text-white",
          side === "left" ? "left-0" : "right-0",
        )}
      >
        <span className="text-xs font-medium uppercase tracking-widest text-white/70">
          {t("auth.promo.eyebrow")}
        </span>
        <p className="mt-3 max-w-xs text-3xl font-semibold leading-tight text-balance">
          {t("auth.promo.headline")}
        </p>
      </div>
    </div>
  );
}
