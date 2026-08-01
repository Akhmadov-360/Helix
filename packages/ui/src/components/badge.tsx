import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn";

// 3+ независимых потребителя уже держали копии этой разметки (project status, phase OPEN/TERM,
// task overdue) — вынесено по правилу «второй-третий потребитель → примитив» (CLAUDE.md).
const badgeVariants = cva("inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-medium", {
  variants: {
    variant: {
      default: "bg-secondary text-secondary-foreground",
      outline: "border border-border text-muted-foreground",
      destructive: "bg-destructive/10 text-destructive",
      success: "bg-accent/10 text-accent",
    },
  },
  defaultVariants: { variant: "default" },
});

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
