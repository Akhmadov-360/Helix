import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { companiesListQueryOptions } from "../../../features/companies/queries";
import { ContactDetailView } from "../../../features/contacts/contact-detail-view";
import { contactQueryOptions } from "../../../features/contacts/queries";
import { meQueryOptions, useMe } from "../../../shared/auth/session";

export const Route = createFileRoute("/_authenticated/contacts/$contactId")({
  loader: async ({ context, params }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions);
    await Promise.all([
      context.queryClient.ensureQueryData(contactQueryOptions(me.activeOrgId, params.contactId)),
      context.queryClient.ensureQueryData(companiesListQueryOptions(me.activeOrgId)),
    ]);
  },
  component: ContactDetailPage,
});

function ContactDetailPage() {
  const { contactId } = Route.useParams();
  const me = useMe();
  const { companies } = useSuspenseQuery(companiesListQueryOptions(me.activeOrgId)).data;
  return <ContactDetailView orgId={me.activeOrgId} contactId={contactId} companies={companies} />;
}
