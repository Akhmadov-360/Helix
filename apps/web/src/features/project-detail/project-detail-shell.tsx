import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
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

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">{project.title}</h1>
      <ProjectTabs projectId={projectId} />
      {children}
    </div>
  );
}
