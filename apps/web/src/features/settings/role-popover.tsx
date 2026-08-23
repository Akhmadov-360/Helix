import { Check, ChevronDown } from "lucide-react";
import { canGrantRole, type Role } from "@helix/api-schemas";
import { cn, Popover, PopoverContent, PopoverTrigger, RoleBadge } from "@helix/ui";
import { useT } from "../../shared/i18n";

const ROLES: Role[] = ["OWNER", "ADMIN", "MANAGER", "MEMBER", "VIEWER"];

// Role-selector под RoleBadge-trigger: клик → popover со списком доступных ролей + короткое
// описание к каждой. Триггер визуально — тот же RoleBadge, что и в read-only режиме, чтобы
// строка не переверстывалась между интерактивным/статичным вариантом; ChevronDown-подсказка
// снаружи от пилюли (не внутри), иначе width badge'а прыгает при переходе через this component.
export interface RolePopoverProps {
  current: Role;
  actorRole: Role;
  personName: string;
  disabled?: boolean;
  onSelect: (role: Role) => void;
}

export function RolePopover({ current, actorRole, personName, disabled, onSelect }: RolePopoverProps) {
  const t = useT();
  const options = ROLES.filter((r) => canGrantRole(actorRole, r));

  return (
    <Popover>
      <PopoverTrigger
        type="button"
        disabled={disabled}
        aria-label={t("settings.members.rolePopover.trigger", { name: personName, role: t(`role.${current}`) })}
        className={cn(
          "inline-flex items-center gap-1 rounded-md transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "disabled:cursor-not-allowed disabled:opacity-60 not-disabled:cursor-pointer",
        )}
      >
        <RoleBadge role={current} label={t(`role.${current}`)} />
        <ChevronDown className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-1.5">
        <p className="px-2.5 py-2 text-xs font-medium text-muted-foreground">
          {t("settings.members.rolePopover.header", { name: personName })}
        </p>
        <div role="listbox" aria-label={t("settings.members.rolePopover.listLabel")}>
          {options.map((r) => (
            <button
              key={r}
              type="button"
              role="option"
              aria-selected={r === current}
              onClick={() => onSelect(r)}
              className={cn(
                "flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-muted",
                r === current && "bg-accent/60",
              )}
            >
              <Check
                className={cn("mt-0.5 h-4 w-4 shrink-0 text-primary", r !== current && "invisible")}
                aria-hidden="true"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">{t(`role.${r}`)}</span>
                <span className="block text-xs leading-snug text-muted-foreground">{t(`role.${r}.desc`)}</span>
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
