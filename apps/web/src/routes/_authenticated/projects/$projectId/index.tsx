import { createFileRoute, redirect } from "@tanstack/react-router";

// /projects/:id само не рендерится — дефолтная вкладка overview (§5 карты URL, зеркало workspaces/$id).
export const Route = createFileRoute("/_authenticated/projects/$projectId/")({
  loader: ({ params }) => {
    throw redirect({ to: "/projects/$projectId/overview", params });
  },
});
