import { createFileRoute } from "@tanstack/react-router";
import { CompaniesView } from "../../../features/companies/companies-view";
import { companiesListQueryOptions } from "../../../features/companies/queries";
import { meQueryOptions, useMe } from "../../../shared/auth/session";

export const Route = createFileRoute("/_authenticated/companies/")({
  loader: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions);
    await context.queryClient.ensureQueryData(companiesListQueryOptions(me.activeOrgId, { limit: 500 }));
  },
  component: CompaniesPage,
});

function CompaniesPage() {
  const me = useMe();
  return <CompaniesView orgId={me.activeOrgId} />;
}
