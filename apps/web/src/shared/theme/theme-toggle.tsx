import { Check, Monitor, Moon, Sun } from "lucide-react";
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@helix/ui";
import { useT } from "../i18n";
import { THEMES, useThemeStore, type ThemePreference } from "./store";

const ICONS: Record<ThemePreference, typeof Sun> = { light: Sun, dark: Moon, system: Monitor };

export function ThemeToggle({ className }: { className?: string }) {
  const t = useT();
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
  const Icon = ICONS[theme];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("theme.toggle.label")}
          className={cn("text-muted-foreground hover:text-foreground", className)}
        >
          <Icon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {THEMES.map((option) => {
          const OptionIcon = ICONS[option];
          return (
            <DropdownMenuItem key={option} onSelect={() => setTheme(option)}>
              <OptionIcon className="h-4 w-4" />
              <span className="flex-1">{t(`theme.option.${option}`)}</span>
              {option === theme && <Check className="h-3.5 w-3.5 text-primary" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
