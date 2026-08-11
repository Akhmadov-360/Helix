import { createFileRoute } from "@tanstack/react-router";
import { AttachmentsView } from "../../../../features/attachments/attachments-view";
import { projectAttachmentsQueryOptions } from "../../../../features/attachments/queries";
import { meQueryOptions, useMe } from "../../../../shared/auth/session";

// Project уже прогрет родительским layout-роутом ($projectId.tsx) — здесь только вложения сделки.
export const Route = createFileRoute("/_authenticated/projects/$projectId/files")({
  loader: async ({ context, params }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions);
    await context.queryClient.ensureQueryData(projectAttachmentsQueryOptions(me.activeOrgId, params.projectId));
  },
  component: FilesPage,
});

function FilesPage() {
  const { projectId } = Route.useParams();
  const me = useMe();

  return <AttachmentsView orgId={me.activeOrgId} projectId={projectId} />;
}
