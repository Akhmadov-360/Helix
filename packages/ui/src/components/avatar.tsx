import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn";

const avatarVariants = cva(
  "inline-flex shrink-0 select-none items-center justify-center rounded-full font-medium text-white",
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

// Детерминированный цвет по имени (design review: "как Trello/Google — цвет закрепляется за
// аккаунтом", не серый bg-secondary для всех). Хэш от имени, не случайный — один и тот же человек
// всегда получает один и тот же цвет на любом экране, без похода в БД за сохранённым значением.
// -600 шейд (не -500) — надёжный контраст с белым текстом (WCAG AA) на каждом цвете палитры.
const AVATAR_COLORS = [
  "bg-blue-600",
  "bg-emerald-600",
  "bg-amber-600",
  "bg-rose-600",
  "bg-purple-600",
  "bg-pink-600",
  "bg-cyan-600",
  "bg-indigo-600",
  "bg-orange-600",
  "bg-teal-600",
];

function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]!;
}

export function Avatar({ name, size, className, ...props }: AvatarProps) {
  return (
    <span className={cn(avatarVariants({ size }), colorFor(name), className)} {...props}>
      {initialsOf(name)}
    </span>
  );
}

export { avatarVariants };
