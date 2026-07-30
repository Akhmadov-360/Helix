import { Link } from "@tanstack/react-router";
import { useT } from "../../shared/i18n";

// Первая tab-nav в приложении (§13 остаток закрыт этим слайсом для overview/activity) — Link
// с activeProps, без отдельного примитива в packages/ui: два таба, третий появится вместе
// с contacts/tasks (следующая veha) — тогда и решим, выносить ли в примитив.
export function ProjectTabs({ projectId }: { projectId: string }) {
  const t = useT();
  const tabClass = "px-3 py-1.5 text-sm rounded-md text-muted-foreground hover:text-foreground";
  const activeClass = "bg-secondary text-foreground font-medium";

  return (
    <nav className="flex gap-1 border-b border-border pb-2">
      <Link
        to="/projects/$projectId/overview"
        params={{ projectId }}
        className={tabClass}
        activeProps={{ className: activeClass }}
      >
        {t("projectDetail.tabs.overview")}
      </Link>
      <Link
        to="/projects/$projectId/activity"
        params={{ projectId }}
        className={tabClass}
        activeProps={{ className: activeClass }}
      >
        {t("projectDetail.tabs.activity")}
      </Link>
    </nav>
  );
}
