import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";
import type { ComponentPropsWithoutRef, ElementRef } from "react";
import { forwardRef } from "react";
import { cn } from "../lib/cn";

export const Collapsible = CollapsiblePrimitive.Root;
export const CollapsibleTrigger = CollapsiblePrimitive.Trigger;

export const CollapsibleContent = forwardRef<
  ElementRef<typeof CollapsiblePrimitive.Content>,
  ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Content>
>(({ className, ...props }, ref) => (
  <CollapsiblePrimitive.Content
    ref={ref}
    className={cn("ui-collapsible-anim overflow-hidden", className)}
    {...props}
  />
));
CollapsibleContent.displayName = "CollapsibleContent";
