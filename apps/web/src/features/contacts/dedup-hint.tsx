import { TriangleAlert } from "lucide-react";
import type { DedupHint as DedupHintData } from "@helix/api-schemas";
import { Button, Card } from "@helix/ui";
import { useT } from "../../shared/i18n";

// §13.3 — сквозной паттерн (не отдельный экран): один компонент, оба тачпоинта дедупа
// (as-you-type подсказка и post-create fallback) рендерят его одинаково.
//
// Стиль сведён к тому же плоскому языку, что Badge variant="destructive" (bg-x/10 + тонкая рамка,
// без градиентов/свечения) — UI-обзор отметил, что более тяжёлая рамка была единственным
// декоративным элементом на иначе плоском тёмном интерфейсе. Merge остаётся outline (не primary):
// это необратимое действие, "Не дубль" — безопасный дефолт, поэтому merge сознательно не тянет
// внимание сильнее дисмисса.
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
    <Card className="flex flex-col gap-2 border-amber-500/30 bg-amber-500/10 p-3 text-sm">
      <p className="flex items-center gap-1.5 font-medium text-amber-600 dark:text-amber-400">
        <TriangleAlert className="h-4 w-4 shrink-0" />
        {t("contacts.dedup.title")}
      </p>
      <ul className="flex flex-col gap-1">
        {hint.candidates.map((candidate) => (
          <li key={candidate.id} className="flex items-center justify-between gap-2">
            <span>
              {candidate.name}
              {candidate.email ? ` — ${candidate.email}` : ""}
              {candidate.companyName ? ` (${candidate.companyName})` : ""}
            </span>
            {canMerge && onMerge && (
              <Button variant="outline" size="sm" onClick={() => onMerge(candidate.id)}>
                {t("contacts.dedup.merge")}
              </Button>
            )}
          </li>
        ))}
      </ul>
      <Button variant="ghost" size="sm" className="w-fit" onClick={onDismiss}>
        {t("contacts.dedup.dismiss")}
      </Button>
    </Card>
  );
}
