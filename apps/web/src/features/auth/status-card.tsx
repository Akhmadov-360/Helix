import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@helix/ui";

// Композиция «иконка в круглом фоне + заголовок + описание» — повторяется в success/invalid
// экранах forgot-password, reset-password и accept-invite (4 места), поэтому вынесено. Локально
// в features/auth, а не в packages/ui: слишком специфично под auth-card layout, чтобы быть
// общим примитивом; но между двумя features (auth + invites) переиспользуется — импорт
// cross-feature допустим для такого малого композита.
export type StatusTone = "success" | "error";

const TONE_CLASSES: Record<StatusTone, string> = {
  success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  error: "bg-destructive/10 text-destructive",
};

export interface StatusCardProps {
  tone: StatusTone;
  icon: LucideIcon;
  title: string;
  /** ReactNode, а не строка — в description часто вставляется bold {email} через <span>. */
  description: ReactNode;
  /** Действия под описанием: обычно 1-2 кнопки/ссылки, компоновка задаётся вызывающей стороной. */
  children?: ReactNode;
}

export function StatusCard({ tone, icon: Icon, title, description, children }: StatusCardProps) {
  return (
    <div className="flex flex-col gap-4" aria-live={tone === "success" ? "polite" : undefined} role={tone === "error" ? "alert" : undefined}>
      <div className={cn("flex h-11 w-11 items-center justify-center rounded-full", TONE_CLASSES[tone])}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {children ? <div className="mt-2 flex flex-col gap-2">{children}</div> : null}
    </div>
  );
}
