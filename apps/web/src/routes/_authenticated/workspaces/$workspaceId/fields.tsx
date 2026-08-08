import { createFileRoute } from "@tanstack/react-router";
import { FieldsPage } from "../../../../features/fields/fields-page";
import { fieldsQueryOptions } from "../../../../features/fields/queries";
import { meQueryOptions, useMe } from "../../../../shared/auth/session";

export const Route = createFileRoute("/_authenticated/workspaces/$workspaceId/fields")({
  loader: async ({ context, params }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions);
    await context.queryClient.ensureQueryData(fieldsQueryOptions(me.activeOrgId, params.workspaceId));
  },
  component: FieldsRoute,
});

function FieldsRoute() {
  const { workspaceId } = Route.useParams();
  const me = useMe();
  return <FieldsPage orgId={me.activeOrgId} workspaceId={workspaceId} />;
}
