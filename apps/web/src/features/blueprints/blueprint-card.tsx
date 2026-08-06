import { ChevronRight } from "lucide-react";
import type { BlueprintResponse } from "@helix/api-schemas";
import { Badge } from "@helix/ui";
import { useLocalize } from "../../shared/lib/localize";
import { useT } from "../../shared/i18n";

const PHASE_PREVIEW_LIMIT = 3;

// Карточка — инструмент принятия решения, не документация: превью фаз обрезано, весь набор
// custom-полей блюпринта тут не показываем вовсе (design-handoff — card grid states). Клик сразу
// коммитит выбор (шаг мастера переключается) — отдельного persisted "selected"-состояния карточке
// не нужно, экран деталей уже даёт путь назад ("сменить шаблон").
export function BlueprintCard({
  blueprint,
  onSelect,
}: {
  blueprint: BlueprintResponse;
  onSelect: () => void;
}) {
  const t = useT();
  const localize = useLocalize();
  const phases = blueprint.definition.phases;
  const shown = phases.slice(0, PHASE_PREVIEW_LIMIT);
  const rest = phases.length - shown.length;

  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full flex-col gap-3 rounded-xl border border-border bg-card p-4 text-left shadow-sm transition-colors hover:border-accent/60"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium text-foreground">{blueprint.name}</span>
        <Badge variant="outline" className="shrink-0 text-[11px]">
          {t(`workspaces.create.audience.${blueprint.audience}`)}
        </Badge>
      </div>
      <div className="flex flex-wrap items-center gap-x-1 gap-y-1.5 text-xs text-muted-foreground">
        {shown.map((phase, index) => (
          <span key={phase.key} className="flex items-center gap-1">
            {index > 0 && <ChevronRight className="h-3 w-3 shrink-0" />}
            <span>{localize(phase.name)}</span>
          </span>
        ))}
        {rest > 0 && (
          <span className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3 shrink-0" />+{rest}
          </span>
        )}
      </div>
      {blueprint.definition.projectFields.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("blueprints.card.fieldsCount", { count: blueprint.definition.projectFields.length })}
        </p>
      )}
    </button>
  );
}
