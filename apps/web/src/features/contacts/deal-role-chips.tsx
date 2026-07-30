import { dealRoleSchema, validRolesFor, type Audience, type DealRole } from "@helix/api-schemas";
import { cn } from "@helix/ui";
import { useT } from "../../shared/i18n";

// audience — recommendation model, НЕ фильтр (project-links.md §4, §13.1 frontend-architecture.md):
// рекомендованные роли выделяются, остальные остаются кликабельными, не прячутся.
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
  const recommended = new Set(validRolesFor(audience));
  const ordered = [...dealRoleSchema.options].sort(
    (a, b) => Number(recommended.has(b)) - Number(recommended.has(a)),
  );

  return (
    <div className="flex flex-wrap gap-1">
      {ordered.map((role) => {
        const active = roles.includes(role);
        return (
          <button
            key={role}
            type="button"
            disabled={disabled}
            onClick={() => onToggle(role)}
            className={cn(
              "rounded-full border px-2 py-0.5 text-xs transition-colors",
              active
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-muted",
              !recommended.has(role) && !active && "opacity-60",
            )}
          >
            {t(`dealRole.${role}`)}
          </button>
        );
      })}
    </div>
  );
}
