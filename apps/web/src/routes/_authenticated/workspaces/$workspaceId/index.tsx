import { createFileRoute, redirect } from "@tanstack/react-router";
import { setLastWorkspaceId } from "../../../../shared/lib/last-workspace";

// /workspaces/:id само не рендерится — дефолтное представление воркспейса (§5 карты URL).
export const Route = createFileRoute("/_authenticated/workspaces/$workspaceId/")({
  loader: ({ params }) => {
    setLastWorkspaceId(params.workspaceId);
    throw redirect({ to: "/workspaces/$workspaceId/board", params });
  },
});
