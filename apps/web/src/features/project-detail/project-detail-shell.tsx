import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@helix/ui";
import { useT } from "../../shared/i18n";
import { projectQueryOptions } from "./queries";
import { ProjectTabs } from "./project-tabs";

// Персистентный под-shell (§13 остаток, вторая половина): заголовок + табы вокруг вкладок
// overview/activity. Contacts/tasks добавятся сюда же следующей vehой, когда их UX спроектируем.
export function ProjectDetailShell({
  orgId,
  projectId,
  children,
}: {
  orgId: string;
  projectId: string;
  children: ReactNode;
}) {
  const project = useSuspenseQuery(projectQueryOptions(orgId, projectId)).data;
  const t = useT();

  return (
    <div className="flex flex-col gap-4">
      {/* Раньше единственный путь назад к доске — browser back; project.workspaceId уже есть
          в ответе, отдельного запроса не требует. */}
      <Link
        to="/workspaces/$workspaceId/board"
        params={{ workspaceId: project.workspaceId }}
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {t("projectDetail.backToBoard")}
      </Link>
      {/* Статус — здесь, не только внутри Overview: виден на любой вкладке, не только на своей. */}
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold">{project.title}</h1>
        <Badge variant={project.status === "WON" ? "success" : project.status === "LOST" ? "destructive" : "default"}>
          {t(`projectDetail.status.${project.status}`)}
        </Badge>
      </div>
      <ProjectTabs projectId={projectId} />
      {children}
    </div>
  );
}
