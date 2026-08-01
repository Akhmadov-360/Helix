import { Link } from "@tanstack/react-router";
import { useT } from "../../shared/i18n";

// Единственная tab-nav в приложении — Link с active/inactiveProps, без отдельного примитива в
// packages/ui: один потребитель (project detail), выносить в packages/ui незачем, пока не появится
// второй.
export function ProjectTabs({ projectId }: { projectId: string }) {
  const t = useT();
  // Router КОНКАТЕНИРУЕТ base className + active/inactiveProps.className (не заменяет, не мёржит
  // twMerge'ом) — если один и тот же вариант ("border-*", "text-*") прописать в двух местах сразу,
  // побеждает не тот, что позже в DOM-атрибуте, а тот, что позже в сгенерённом Tailwind CSS
  // (непредсказуемо). Поэтому у каждого CSS-свойства ровно ОДИН источник: статика — в base, а
  // active/inactive-вариации — только в своём наборе, без дублей.
  const tabClass = "px-1 pb-2 text-sm transition-colors hover:text-foreground";
  const inactiveClass = { className: "border-b-2 border-transparent font-normal text-muted-foreground" };
  const activeClass = { className: "border-b-2 border-accent font-medium text-foreground" };

  return (
    <nav className="flex gap-5 border-b border-border">
      <Link
        to="/projects/$projectId/contacts"
        params={{ projectId }}
        className={tabClass}
        activeProps={activeClass}
        inactiveProps={inactiveClass}
      >
        {t("projectDetail.tabs.contacts")}
      </Link>
      <Link
        to="/projects/$projectId/tasks"
        params={{ projectId }}
        className={tabClass}
        activeProps={activeClass}
        inactiveProps={inactiveClass}
      >
        {t("projectDetail.tabs.tasks")}
      </Link>
      <Link
        to="/projects/$projectId/activity"
        params={{ projectId }}
        className={tabClass}
        activeProps={activeClass}
        inactiveProps={inactiveClass}
      >
        {t("projectDetail.tabs.activity")}
      </Link>
    </nav>
  );
}
