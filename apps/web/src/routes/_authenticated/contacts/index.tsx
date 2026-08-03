import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { companiesListQueryOptions } from "../../../features/companies/queries";
import { GlobalContactsView } from "../../../features/contacts/global-contacts-view";
import { contactsListQueryOptions } from "../../../features/contacts/queries";
import { meQueryOptions, useMe } from "../../../shared/auth/session";

// companies грузится здесь (не внутри features/contacts) для join companyId→name (п.6) и для
// company-пикера в форме — features/* не импортируют друг друга напрямую, композиция тут.
export const Route = createFileRoute("/_authenticated/contacts/")({
  loader: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions);
    await Promise.all([
      context.queryClient.ensureQueryData(contactsListQueryOptions(me.activeOrgId)),
      context.queryClient.ensureQueryData(companiesListQueryOptions(me.activeOrgId)),
    ]);
  },
  component: ContactsPage,
});

function ContactsPage() {
  const me = useMe();
  const { companies } = useSuspenseQuery(companiesListQueryOptions(me.activeOrgId)).data;
  return <GlobalContactsView orgId={me.activeOrgId} companies={companies} />;
}
