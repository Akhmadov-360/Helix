import type { TextareaHTMLAttributes } from "react";
import { cn } from "../lib/cn";

// Единственный многострочный текстовый примитив (первый потребитель — custom field type
// "longtext", custom-fields.md §4) — та же визуальная грамматика, что Input (border/ring/disabled),
// только auto-height через rows, а не фиксированная h-10.
export function Textarea({ className, rows = 3, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      rows={rows}
      className={cn(
        "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
