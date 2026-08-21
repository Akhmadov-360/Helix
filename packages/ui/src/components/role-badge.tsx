import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn";

// Отдельный примитив, не variant Badge: у Badge четыре нейтральных variant'а
// (default/outline/destructive/success), которые не отражают доменную семантику ролей.
// Здесь смысл — уровень доступа, не тональность; сопоставление role → визуал живёт в одном месте.
export type Role = "OWNER" | "ADMIN" | "MANAGER" | "MEMBER" | "VIEWER";

const ROLE_CLASSES: Record<Role, string> = {
  OWNER: "border-primary/30 bg-primary/10 text-primary",
  ADMIN: "border-primary/25 bg-accent text-accent-foreground",
  MANAGER: "border-border bg-muted text-muted-foreground",
  MEMBER: "border-border bg-muted text-muted-foreground",
  VIEWER: "border-dashed border-border bg-transparent text-muted-foreground",
};

export interface RoleBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  role: Role;
  /** Локализованная подпись роли — компонент i18n-агностик, не тянет useT. */
  label: string;
}

export function RoleBadge({ role, label, className, ...props }: RoleBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[0.6875rem] font-medium uppercase tracking-wide",
        ROLE_CLASSES[role],
        className,
      )}
      {...props}
    >
      {label}
    </span>
  );
}
