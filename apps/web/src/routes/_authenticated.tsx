import { createFileRoute, redirect } from "@tanstack/react-router";
import { AppShell } from "../app/app-shell";
import { TransportError } from "../shared/api";
import { meQueryOptions } from "../shared/auth/session";

export const Route = createFileRoute("/_authenticated")({
  // loader греет кэш `me` (§4.2). 401 = нет сессии → на /login; прочие ошибки уходят в boundary (§9.2).
  loader: async ({ context }) => {
    try {
      const me = await context.queryClient.ensureQueryData(meQueryOptions);
      if (me.activeOrgId === null) throw redirect({ to: "/no-organization" });
    } catch (error) {
      if (error instanceof TransportError && error.kind === "unauthorized") {
        throw redirect({ to: "/login" });
      }
      throw error;
    }
  },
  component: AppShell,
});
