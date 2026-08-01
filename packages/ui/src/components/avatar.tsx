import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn";

const avatarVariants = cva(
  "inline-flex shrink-0 select-none items-center justify-center rounded-full bg-secondary font-medium text-secondary-foreground",
  {
    variants: {
      size: {
        sm: "h-7 w-7 text-xs",
        default: "h-9 w-9 text-sm",
        lg: "h-11 w-11 text-base",
      },
    },
    defaultVariants: { size: "default" },
  },
);

export interface AvatarProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof avatarVariants> {
  name: string;
}

// Фото нет в домене (нет S3-поля под avatar) — инициалы, не Radix Avatar (fallback-логика того
// компонента рассчитана на image-loading, который тут не нужен).
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

export function Avatar({ name, size, className, ...props }: AvatarProps) {
  return (
    <span className={cn(avatarVariants({ size }), className)} {...props}>
      {initialsOf(name)}
    </span>
  );
}
