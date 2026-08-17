import { Check, X } from "lucide-react";
import { cn } from "../lib/cn";

export interface PasswordRequirement {
  key: string;
  label: string;
  met: boolean;
}

export function PasswordRequirementsList({ requirements }: { requirements: PasswordRequirement[] }) {
  return (
    <ul className="flex flex-col gap-1">
      {requirements.map((r) => (
        <li key={r.key} className="flex items-center gap-1.5 text-xs">
          {r.met ? (
            <Check className="h-3.5 w-3.5 shrink-0 text-green-500" aria-hidden="true" />
          ) : (
            <X className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden="true" />
          )}
          <span className={cn(r.met ? "text-muted-foreground" : "text-foreground")}>{r.label}</span>
        </li>
      ))}
    </ul>
  );
}
