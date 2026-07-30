import type { DedupHint as DedupHintData } from "@helix/api-schemas";
import { Button, Card } from "@helix/ui";
import { useT } from "../../shared/i18n";

// §13.3 — сквозной паттерн (не отдельный экран): один компонент, оба тачпоинта дедупа
// (as-you-type подсказка и post-create fallback) рендерят его одинаково.
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
    <Card className="flex flex-col gap-2 border-amber-500/40 bg-amber-500/5 p-3 text-sm">
      <p className="font-medium">{t("contacts.dedup.title")}</p>
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
