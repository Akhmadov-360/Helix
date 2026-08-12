import { createFileRoute } from "@tanstack/react-router";
import { AuditLogPage } from "../../../features/settings/audit-log-page";
import { auditLogQueryOptions } from "../../../features/settings/queries";
import { meQueryOptions, useMe } from "../../../shared/auth/session";

export const Route = createFileRoute("/_authenticated/settings/audit-log")({
  loader: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions);
    // limit совпадает с дефолтным pageSize в AuditLogPage — иначе прогретый здесь ключ кэша не
    // совпадёт с первым реальным запросом компонента, и прогрев окажется бесполезным.
    await context.queryClient.ensureQueryData(auditLogQueryOptions(me.activeOrgId, { limit: 25 }));
  },
  component: AuditLogRoute,
});

function AuditLogRoute() {
  const me = useMe();
  return <AuditLogPage orgId={me.activeOrgId} />;
}
