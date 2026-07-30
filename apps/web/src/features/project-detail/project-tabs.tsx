import { Link } from "@tanstack/react-router";
import { useT } from "../../shared/i18n";

// Единственная tab-nav в приложении — Link с activeProps, без отдельного примитива в packages/ui:
// один потребитель (project detail), выносить в packages/ui незачем, пока не появится второй.
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
        to="/projects/$projectId/contacts"
        params={{ projectId }}
        className={tabClass}
        activeProps={{ className: activeClass }}
      >
        {t("projectDetail.tabs.contacts")}
      </Link>
      <Link
        to="/projects/$projectId/tasks"
        params={{ projectId }}
        className={tabClass}
        activeProps={{ className: activeClass }}
      >
        {t("projectDetail.tabs.tasks")}
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
