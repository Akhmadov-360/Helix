import { createFileRoute, redirect } from "@tanstack/react-router";
import { workspacesQueryOptions } from "../../features/workspaces/queries";
import { meQueryOptions } from "../../shared/auth/session";
import { getLastWorkspaceId } from "../../shared/lib/last-workspace";

// "/" не рендерится — только редирект (§5 карты URL): на последний открытый воркспейс
// (localStorage-хинт), иначе на первый из списка, иначе на пустой /workspaces.
export const Route = createFileRoute("/_authenticated/")({
  loader: async ({ context }) => {
    const hint = getLastWorkspaceId();
    if (hint) throw redirect({ to: "/workspaces/$workspaceId", params: { workspaceId: hint } });

    const me = await context.queryClient.ensureQueryData(meQueryOptions);
    const workspaces = await context.queryClient.ensureQueryData(workspacesQueryOptions(me.activeOrgId));
    const first = workspaces[0];
    if (first) throw redirect({ to: "/workspaces/$workspaceId", params: { workspaceId: first.id } });
    throw redirect({ to: "/workspaces" });
  },
});
