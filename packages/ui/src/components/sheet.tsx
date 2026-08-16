import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { ComponentPropsWithoutRef, ElementRef, HTMLAttributes } from "react";
import { forwardRef } from "react";
import { cn } from "../lib/cn";

// ai-chat.md §13.1 — боковая панель, единственный потребитель сегодня — ChatDrawer, заводится как
// примитив (не локальная разметка apps/web), т.к. второй потребитель — вопрос времени, не "если".
// Та же Radix-база, что Dialog (Portal+Overlay+Content) — right-side вариант, не центрирование.
export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

// В отличие от Dialog — без встроенного corner-X: потребитель (ChatDrawer) кладёт свою кнопку
// Close в SheetHeader рядом с другими действиями (thread-selector/New chat), встроенный X здесь
// дал бы два крестика одновременно.
export const SheetContent = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/50" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "ui-sheet-anim fixed inset-y-0 right-0 z-50 flex h-full w-full flex-col border-l border-border bg-card shadow-lg sm:w-[400px]",
        className,
      )}
      {...props}
    >
      {children}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
SheetContent.displayName = "SheetContent";

export function SheetHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center gap-2 border-b border-border px-3 py-3", className)} {...props} />;
}

export const SheetTitle = forwardRef<
  ElementRef<typeof DialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn("text-sm font-semibold", className)} {...props} />
));
SheetTitle.displayName = "SheetTitle";

export const SheetDescription = forwardRef<
  ElementRef<typeof DialogPrimitive.Description>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
SheetDescription.displayName = "SheetDescription";
