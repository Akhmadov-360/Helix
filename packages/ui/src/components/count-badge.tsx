import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn";

// Muted-стилизованный чип для числа рядом с лейблом ("Участники [7]", "Приглашения [0]",
// "Роль [1]"). Ровно тот же inline-span, что дублировался в четырёх местах — вынесен по правилу
// "3+ потребителя → примитив" (CLAUDE.md). tabular-nums, чтобы ширина не прыгала на смене значения.
export function CountBadge({ value, className, ...props }: HTMLAttributes<HTMLSpanElement> & { value: number | string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted px-1.5 text-xs font-semibold tabular-nums text-muted-foreground",
        className,
      )}
      {...props}
    >
      {value}
    </span>
  );
}
