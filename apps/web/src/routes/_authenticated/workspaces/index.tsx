import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { workspacesQueryOptions } from "../../../features/workspaces/queries";
import { useT } from "../../../shared/i18n";
import { meQueryOptions, useMe } from "../../../shared/auth/session";

export const Route = createFileRoute("/_authenticated/workspaces/")({
  loader: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions);
    await context.queryClient.ensureQueryData(workspacesQueryOptions(me.activeOrgId));
  },
  component: WorkspacesPage,
});

function WorkspacesPage() {
  const t = useT();
  const me = useMe();
  const workspaces = useSuspenseQuery(workspacesQueryOptions(me.activeOrgId)).data;

  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-lg font-semibold">{t("workspaces.title")}</h1>
      {workspaces.length === 0 ? (
        <p className="text-muted-foreground">{t("workspaces.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {workspaces.map((workspace) => (
            <li key={workspace.id}>
              <Link
                to="/workspaces/$workspaceId"
                params={{ workspaceId: workspace.id }}
                className="text-sm text-primary hover:underline"
              >
                {workspace.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
