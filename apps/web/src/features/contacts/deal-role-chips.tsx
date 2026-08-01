import { Plus, X } from "lucide-react";
import { useState } from "react";
import { dealRoleSchema, validRolesFor, type Audience, type DealRole } from "@helix/api-schemas";
import { Badge, Popover, PopoverContent, PopoverTrigger, cn } from "@helix/ui";
import { useT } from "../../shared/i18n";

// audience — recommendation model, НЕ фильтр (project-links.md §4, §13.1 frontend-architecture.md):
// рекомендованные роли выделяются, остальные остаются кликабельными, не прячутся. Компактный вид
// (redesign): на карточке видны только НАЗНАЧЕННЫЕ роли — полный список из 6 одинаковых чипов на
// каждой карточке был главным источником визуального шума (одна и та же таксономия трижды подряд
// в сетке). Полный список остаётся доступен через попап «+ роль» — ни одна роль не скрыта и не
// задизейблена, инвариант recommendation model сохранён.
export function DealRoleChips({
  roles,
  audience,
  onToggle,
  disabled = false,
}: {
  roles: DealRole[];
  audience: Audience;
  onToggle: (role: DealRole) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const recommended = new Set(validRolesFor(audience));
  const ordered = [...dealRoleSchema.options].sort(
    (a, b) => Number(recommended.has(b)) - Number(recommended.has(a)),
  );

  return (
    <div className="flex flex-wrap items-center gap-1">
      {roles.map((role) => (
        <button
          key={role}
          type="button"
          disabled={disabled}
          onClick={() => onToggle(role)}
          className="group inline-flex items-center gap-1 rounded-full border border-primary bg-primary/10 py-0.5 pl-2 pr-1 text-xs text-primary transition-colors disabled:pointer-events-none"
        >
          {t(`dealRole.${role}`)}
          {!disabled && <X className="h-3 w-3 opacity-60 transition-opacity group-hover:opacity-100" />}
        </button>
      ))}

      {!disabled && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
            >
              <Plus className="h-3 w-3" />
              {t("contacts.roles.add")}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-1" align="start">
            <div className="flex flex-col">
              {ordered.map((role) => {
                const active = roles.includes(role);
                return (
                  <button
                    key={role}
                    type="button"
                    onClick={() => onToggle(role)}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted",
                      active && "text-primary",
                    )}
                  >
                    <span>{t(`dealRole.${role}`)}</span>
                    {!recommended.has(role) && !active && (
                      <Badge variant="outline" className="shrink-0 py-0 text-[10px]">
                        {t("contacts.roles.notTypical")}
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
