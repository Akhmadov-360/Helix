import { createFileRoute } from "@tanstack/react-router";
import { CompanyDetailView } from "../../../features/companies/company-detail-view";
import { companyQueryOptions } from "../../../features/companies/queries";
import { meQueryOptions, useMe } from "../../../shared/auth/session";

export const Route = createFileRoute("/_authenticated/companies/$companyId")({
  loader: async ({ context, params }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions);
    await context.queryClient.ensureQueryData(companyQueryOptions(me.activeOrgId, params.companyId));
  },
  component: CompanyDetailPage,
});

function CompanyDetailPage() {
  const { companyId } = Route.useParams();
  const me = useMe();
  return <CompanyDetailView orgId={me.activeOrgId} companyId={companyId} />;
}
