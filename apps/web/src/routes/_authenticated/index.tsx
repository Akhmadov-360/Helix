import { createFileRoute, redirect } from "@tanstack/react-router";
import { workspacesQueryOptions } from "../../features/workspaces/queries";
import { meQueryOptions } from "../../shared/auth/session";
import { clearLastWorkspaceId, getLastWorkspaceId } from "../../shared/lib/last-workspace";

// "/" не рендерится — только редирект (§5 карты URL): на последний открытый воркспейс
// (localStorage-хинт), иначе на первый из списка, иначе на пустой /workspaces.
export const Route = createFileRoute("/_authenticated/")({
  loader: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions);
    const workspaces = await context.queryClient.ensureQueryData(workspacesQueryOptions(me.activeOrgId));

    // Хинт валиден, только если это воркспейс ТЕКУЩЕЙ орги (last-workspace.ts: "не доверенный
    // источник"). Он переживает logout/switch-org/login не всегда (закрытая без /logout вкладка,
    // ручная правка localStorage) — слепой редирект на невалидный id раньше давал 404 "Workspace
    // not found" вместо штатного fallback ниже.
    const hint = getLastWorkspaceId();
    if (hint) {
      if (workspaces.some((w) => w.id === hint)) {
        throw redirect({ to: "/workspaces/$workspaceId", params: { workspaceId: hint } });
      }
      clearLastWorkspaceId();
    }

    const first = workspaces[0];
    if (first) throw redirect({ to: "/workspaces/$workspaceId", params: { workspaceId: first.id } });
    throw redirect({ to: "/workspaces" });
  },
});
