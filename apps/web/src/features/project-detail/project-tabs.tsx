import { Link } from "@tanstack/react-router";
import { useT } from "../../shared/i18n";

// Единственная tab-nav в приложении — Link с activeProps, без отдельного примитива в packages/ui:
// один потребитель (project detail), выносить в packages/ui незачем, пока не появится второй.
export function ProjectTabs({ projectId }: { projectId: string }) {
  const t = useT();
  const tabClass =
    "border-b-2 border-transparent px-1 pb-2 text-sm text-muted-foreground transition-colors hover:text-foreground";
  const activeClass = "border-accent font-medium text-foreground";

  return (
    <nav className="flex gap-5 border-b border-border">
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
