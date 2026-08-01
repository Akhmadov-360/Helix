import type { LabelHTMLAttributes } from "react";
import { cn } from "../lib/cn";

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  // Звёздочка обязательного поля (redesign): единственный маркер "required" был раньше только на
  // <Input required> — валиден для браузерной валидации, но невидим пользователю до сабмита.
  required?: boolean;
}

export function Label({ className, required, children, ...props }: LabelProps) {
  return (
    <label
      className={cn(
        "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
        className,
      )}
      {...props}
    >
      {children}
      {required && (
        <span className="ml-0.5 text-destructive" aria-hidden="true">
          *
        </span>
      )}
    </label>
  );
}
