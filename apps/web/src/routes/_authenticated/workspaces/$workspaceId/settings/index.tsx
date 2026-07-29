import { createFileRoute, redirect } from "@tanstack/react-router";

// /settings само не рендерится — дефолтное представление (§5 карты URL, зеркало workspaces/$id/index.tsx).
export const Route = createFileRoute("/_authenticated/workspaces/$workspaceId/settings/")({
  loader: ({ params }) => {
    throw redirect({ to: "/workspaces/$workspaceId/settings/phases", params });
  },
});
