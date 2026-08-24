import { TriangleAlert } from "lucide-react";
import type { DedupHint as DedupHintData } from "@helix/api-schemas";
import { Avatar, Button, Card } from "@helix/ui";
import { useT } from "../../shared/i18n";

// §13.3 — сквозной паттерн (не отдельный экран): один компонент, оба тачпоинта дедупа
// (as-you-type подсказка и post-create fallback) рендерят его одинаково.
//
// Redesign (Figma-inspired): раньше кандидаты были плоской строкой «Name — email (company)»
// с текстовым listing'ом — глазом трудно за секунду опознать «это тот же самый человек?».
// Теперь каждый кандидат — карточка-строка с Avatar + именем крупно + email/company muted
// и Merge-кнопкой справа. Смотришь на аватарку и инициалы — сразу считывается кто это.
//
// Merge остаётся outline (не primary): merge необратим (объединяет два контакта в один),
// «Не дубль» — безопасный дефолт. Дисмисс сознательно НЕ ghost-на-fit-width внизу карточки —
// теперь это full-width secondary-строка над карточкой, симметрично «Merge»/«Create anyway»
// в Figma. Юзер видит оба варианта равновесно, а не «Merge с акцентом, dismiss спрятан».
export function DedupHint({
  hint,
  canMerge,
  onMerge,
  onDismiss,
}: {
  hint: DedupHintData;
  canMerge: boolean;
  onMerge?: (candidateId: string) => void;
  onDismiss: () => void;
}) {
  const t = useT();
  if (hint.candidates.length === 0) return null;

  return (
    <Card className="flex flex-col gap-3 border-amber-500/30 bg-amber-500/10 p-3 text-sm shadow-none">
      <div className="flex items-start justify-between gap-2">
        <p className="flex min-w-0 items-center gap-1.5 font-medium text-amber-700 dark:text-amber-400">
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{t("contacts.dedup.title")}</span>
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-auto shrink-0 px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          onClick={onDismiss}
        >
          {t("contacts.dedup.dismiss")}
        </Button>
      </div>
      <ul className="flex flex-col gap-2">
        {hint.candidates.map((candidate) => (
          <li
            key={candidate.id}
            className="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-background/50 px-3 py-2"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <Avatar name={candidate.name} size="sm" className="shrink-0" />
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{candidate.name}</p>
                {(candidate.email || candidate.companyName) && (
                  <p className="truncate text-xs text-muted-foreground">
                    {[candidate.email, candidate.companyName].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
            </div>
            {canMerge && onMerge && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => onMerge(candidate.id)}
              >
                {t("contacts.dedup.merge")}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
