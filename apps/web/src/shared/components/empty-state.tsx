import type { ReactNode } from "react";
import { cn } from "@helix/ui";

// Третий потребитель (Tasks/Pages/Contacts-fallback после Files' Dropzone) — общий паттерн
// из Figma-макетов пустых состояний: акцентная иконка-бейдж + заголовок + подзаголовок + CTA.
// Files не переиспользует этот примитив — там своя интерактивная dropzone (drag&drop, formats
// hint), а не статичная заглушка.
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1 rounded-xl border border-border bg-card px-6 py-12 text-center",
        className,
      )}
    >
      <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-accent/10 text-accent">
        <Icon className="h-7 w-7" />
      </span>
      <p className="text-lg font-semibold">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
