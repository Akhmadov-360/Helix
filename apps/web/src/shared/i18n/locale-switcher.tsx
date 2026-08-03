import { Check, Globe } from "lucide-react";
import { LOCALES, type Locale } from "@helix/api-schemas";
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@helix/ui";
import { useLocaleStore } from "./store";
import { useT } from "./use-t";

// Названия языков — родным написанием, не переводом (стандартный паттерн переключателя локали:
// "Русский" видно и когда текущий язык английский).
const LABELS: Record<Locale, string> = { ru: "Русский", en: "English", uz: "Oʻzbekcha" };

export function LocaleSwitcher({ className }: { className?: string }) {
  const t = useT();
  const locale = useLocaleStore((state) => state.locale);
  const setLocale = useLocaleStore((state) => state.setLocale);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("locale.switcher.label")}
          className={cn("text-muted-foreground hover:text-foreground", className)}
        >
          <Globe className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {LOCALES.map((option) => (
          <DropdownMenuItem key={option} onSelect={() => setLocale(option)}>
            <span className="flex-1">{LABELS[option]}</span>
            {option === locale && <Check className="h-3.5 w-3.5 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
