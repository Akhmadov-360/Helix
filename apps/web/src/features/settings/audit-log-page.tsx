import { useSuspenseQuery } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableToolbar } from "@helix/ui";
import { useT } from "../../shared/i18n";
import { auditLogQueryOptions } from "./queries";
import { auditLogSummary } from "./audit-log-summary";

const COLUMN_COUNT = 3;

// decisions.md D5: org-security-аудит, O/A only — доступ гейтится на роуте (useCan("AuditLog.read")),
// сервер (@CheckPolicy) — единственный энфорсер.
export function AuditLogPage({ orgId }: { orgId: string }) {
  const t = useT();
  const entries = useSuspenseQuery(auditLogQueryOptions(orgId)).data;

  const toolbar = <TableToolbar title={t("settings.auditLog.title")} />;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <p className="text-sm text-muted-foreground">{t("settings.auditLog.subtitle")}</p>
      <Table toolbar={toolbar} containerClassName="min-h-0 flex-1" className="min-w-[560px]">
        <TableHeader>
          <TableRow header>
            <TableHead>{t("settings.auditLog.list.event")}</TableHead>
            <TableHead className="w-44">{t("settings.auditLog.list.actor")}</TableHead>
            <TableHead className="w-44">{t("settings.auditLog.list.when")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.length === 0 ? (
            <TableRow>
              <TableCell colSpan={COLUMN_COUNT}>
                <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
                  <ScrollText className="h-8 w-8" />
                  <p>{t("settings.auditLog.empty")}</p>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="text-foreground">{auditLogSummary(entry, t)}</TableCell>
                <TableCell className="text-muted-foreground">
                  {entry.actorName ?? t("settings.auditLog.systemActor")}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(entry.createdAt).toLocaleString()}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
