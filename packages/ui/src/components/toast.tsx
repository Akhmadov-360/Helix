import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn";

const toastVariants = cva(
  "pointer-events-auto flex w-full items-start justify-between gap-3 rounded-md border p-3 text-sm shadow-lg",
  {
    variants: {
      variant: {
        default: "border-border bg-background text-foreground",
        destructive: "border-destructive/50 bg-destructive text-destructive-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface ToastProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof toastVariants> {}

// role зависит от варианта: destructive прерывает (alert), default просто объявляется (status) — §a11y.
export function Toast({ className, variant, ...props }: ToastProps) {
  return (
    <div role={variant === "destructive" ? "alert" : "status"} className={cn(toastVariants({ variant }), className)} {...props} />
  );
}

export { toastVariants };
