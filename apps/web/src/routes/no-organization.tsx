import { createFileRoute, redirect } from "@tanstack/react-router";
import { NoOrganizationPage } from "../features/organizations/no-organization-page";
import { TransportError } from "../shared/api";
import { meQueryOptions } from "../shared/auth/session";

export const Route = createFileRoute("/no-organization")({
  loader: async ({ context }) => {
    try {
      const me = await context.queryClient.ensureQueryData(meQueryOptions);
      if (me.activeOrgId !== null) throw redirect({ to: "/" });
    } catch (error) {
      if (error instanceof TransportError && error.kind === "unauthorized") {
        throw redirect({ to: "/login" });
      }
      throw error;
    }
  },
  component: NoOrganizationPage,
});
