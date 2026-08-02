import { TriangleAlert } from "lucide-react";
import type { CompanyDedupHint as CompanyDedupHintData } from "@helix/api-schemas";
import { Button, Card } from "@helix/ui";
import { useT } from "../../shared/i18n";

// Тот же плоский язык, что contacts/dedup-hint.tsx (§13.3 — единый визуальный паттерн дедупа
// во всём приложении). Без merge: Company не несёт merge-действия (capabilities.ts — только
// create/read/update/delete), только предупреждение + дисмисс.
export function CompanyDedupHint({ hint, onDismiss }: { hint: CompanyDedupHintData; onDismiss: () => void }) {
  const t = useT();
  if (hint.candidates.length === 0) return null;

  return (
    <Card className="flex flex-col gap-2 border-amber-500/30 bg-amber-500/10 p-3 text-sm">
      <p className="flex items-center gap-1.5 font-medium text-amber-600 dark:text-amber-400">
        <TriangleAlert className="h-4 w-4 shrink-0" />
        {t("companies.dedup.title")}
      </p>
      <ul className="flex flex-col gap-1">
        {hint.candidates.map((candidate) => (
          <li key={candidate.id}>
            {candidate.name}
            {candidate.domain ? ` — ${candidate.domain}` : ""}
          </li>
        ))}
      </ul>
      <Button variant="ghost" size="sm" className="w-fit" onClick={onDismiss}>
        {t("companies.dedup.dismiss")}
      </Button>
    </Card>
  );
}
