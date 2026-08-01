import { createFileRoute, redirect } from "@tanstack/react-router";

// /projects/:id само не рендерится — дефолтная вкладка contacts (redesign: вкладку "Обзор"
// убрали, её контент переехал в персистентный сайдбар project-detail-shell.tsx).
export const Route = createFileRoute("/_authenticated/projects/$projectId/")({
  loader: ({ params }) => {
    throw redirect({ to: "/projects/$projectId/contacts", params });
  },
});
