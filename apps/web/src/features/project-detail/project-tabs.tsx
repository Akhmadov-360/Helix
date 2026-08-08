import { Link, useLocation } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { cn } from "@helix/ui";
import { useT } from "../../shared/i18n";

const TABS = ["contacts", "tasks", "activity"] as const;

// Единственная tab-nav в приложении — Link'и, без отдельного примитива в packages/ui: один
// потребитель (project detail), выносить незачем, пока не появится второй.
//
// Скользящий индикатор (layoutId) требует, чтобы сам ProjectTabs не размонтировался между вкладками
// — раньше каждый из трёх листовых роутов (contacts/tasks/activity) оборачивал children в свою
// копию ProjectDetailShell, и ProjectTabs пересоздавался заново при каждом клике. Теперь shell живёт
// в persistent layout-роуте ($projectId.tsx), ProjectTabs монтируется один раз — FLIP-анимация
// между активными табами работает по-настоящему, не дёргается.
export function ProjectTabs({ projectId }: { projectId: string }) {
  const t = useT();
  const pathname = useLocation({ select: (location) => location.pathname });

  return (
    <nav className="flex gap-5 border-b border-border">
      {TABS.map((tab) => {
        const active = pathname.endsWith(`/${tab}`);
        return (
          <Link
            key={tab}
            to={`/projects/$projectId/${tab}`}
            params={{ projectId }}
            className={cn(
              "relative px-1 pb-2 text-sm transition-colors hover:text-foreground",
              active ? "font-medium text-foreground" : "font-normal text-muted-foreground",
            )}
          >
            {t(`projectDetail.tabs.${tab}`)}
            {active && (
              <motion.span
                layoutId="projectTabIndicator"
                className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-accent"
                transition={{ duration: 0.2, ease: "easeInOut" }}
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
