import type { CSSProperties } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

// shadcn/ui sonner.tsx recipe, minus next-themes (этот монорепо не тянет её ради одного пропа) —
// вызывающий код (apps/web) передаёт уже резолвленную тему явным `theme` (см. shared/theme).
// CSS-переменные ссылаются на токены дизайн-системы (globals.css) — тост наследует тему проекта
// автоматически, без своей копии палитры.
export function Toaster({ theme = "system", ...props }: ToasterProps) {
  return (
    <Sonner
      theme={theme}
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as CSSProperties
      }
      {...props}
    />
  );
}
