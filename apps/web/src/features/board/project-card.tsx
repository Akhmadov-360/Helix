import { Card } from "@helix/ui";
import { useLocaleStore } from "../../shared/i18n";
import type { ProjectCardViewModel } from "./select";

export function ProjectCard({ project }: { project: ProjectCardViewModel }) {
  const locale = useLocaleStore((state) => state.locale);

  return (
    <Card className="p-3" role="listitem">
      <p className="text-sm font-medium">{project.title}</p>
      {project.amount && <p className="mt-1 text-xs text-muted-foreground">{formatAmount(project.amount, locale)}</p>}
    </Card>
  );
}

function formatAmount(amount: { value: number; currency: string }, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: amount.currency }).format(amount.value);
}
