import { Fragment, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, ScrollText } from "lucide-react";
import { auditActionSchema, type AuditAction } from "@helix/api-schemas";
import {
  Button,
  Pagination,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
} from "@helix/ui";
import type { MessageKey } from "../../shared/i18n";
import { useT } from "../../shared/i18n";
import { useCursorPagination } from "../../shared/lib/use-cursor-pagination";
import { auditLogDetails, auditLogSummary } from "./audit-log-summary";
import { auditLogQueryOptions } from "./queries";

const COLUMN_COUNT = 4;
const ALL_ACTIONS = "all";

// Короткие подписи для фильтра — отдельно от auditLogSummary (те принимают payload и строят
// предложение, здесь нужен просто ярлык типа события без параметров).
const FILTER_LABEL_KEY: Record<AuditAction, MessageKey> = {
  "contact.merged": "settings.auditLog.filter.contactMerged",
  "membership.role_changed": "settings.auditLog.filter.membershipRoleChanged",
  "membership.removed": "settings.auditLog.filter.membershipRemoved",
  "organization.created": "settings.auditLog.filter.organizationCreated",
  "invite.created": "settings.auditLog.filter.inviteCreated",
  "invite.accepted": "settings.auditLog.filter.inviteAccepted",
  "invite.revoked": "settings.auditLog.filter.inviteRevoked",
  "organization.settings_updated": "settings.auditLog.filter.organizationSettingsUpdated",
  "security.refresh_token_reuse_detected": "settings.auditLog.filter.securityRefreshTokenReuse",
};

// decisions.md D5: org-security-аудит, O/A only — доступ гейтится на роуте (useCan("AuditLog.read")),
// сервер (@CheckPolicy) — единственный энфорсер.
export function AuditLogPage({ orgId }: { orgId: string }) {
  const t = useT();
  const [action, setAction] = useState<AuditAction | "all">(ALL_ACTIONS);
  const [pageSize, setPageSize] = useState(25);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const pagination = useCursorPagination(`${action}|${pageSize}`);

  // useQuery + placeholderData (не useSuspenseQuery) — смена фильтра/страницы не мигает пустым
  // экраном, тот же приём, что companies-view.tsx.
  const { data, isFetching } = useQuery({
    ...auditLogQueryOptions(orgId, {
      cursor: pagination.cursorId,
      limit: pageSize,
      action: action === ALL_ACTIONS ? undefined : action,
    }),
    placeholderData: keepPreviousData,
  });
  const entries = data?.entries ?? [];
  const hasMore = data?.hasMore ?? false;

  function toggleExpanded(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const toolbar = (
    <TableToolbar
      title={t("settings.auditLog.title")}
      filters={
        <Select value={action} onValueChange={(v) => setAction(v as AuditAction | "all")}>
          <SelectTrigger className="h-9 w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_ACTIONS}>{t("settings.auditLog.filter.all")}</SelectItem>
            {auditActionSchema.options.map((a) => (
              <SelectItem key={a} value={a}>
                {t(FILTER_LABEL_KEY[a])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <p className="text-sm text-muted-foreground">{t("settings.auditLog.subtitle")}</p>
      <Table toolbar={toolbar} containerClassName="min-h-0 flex-1" className="min-w-[560px]">
        <TableHeader>
          <TableRow header>
            <TableHead className="w-8">
              <span className="sr-only">{t("settings.auditLog.list.expand")}</span>
            </TableHead>
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
            entries.map((entry) => {
              const details = auditLogDetails(entry, t);
              const isExpanded = expanded.has(entry.id);
              return (
                <Fragment key={entry.id}>
                  <TableRow>
                    <TableCell>
                      {details.length > 0 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t(isExpanded ? "settings.auditLog.list.collapse" : "settings.auditLog.list.expand")}
                          onClick={() => toggleExpanded(entry.id)}
                        >
                          {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </Button>
                      )}
                    </TableCell>
                    <TableCell className="text-foreground">{auditLogSummary(entry, t)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {entry.actorName ?? t("settings.auditLog.systemActor")}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(entry.createdAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow>
                      <TableCell colSpan={COLUMN_COUNT} className="bg-muted/30">
                        <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 py-1 text-xs">
                          {details.map((d) => (
                            <Fragment key={d.label}>
                              <dt className="text-muted-foreground">{d.label}</dt>
                              <dd className="text-foreground">{d.value}</dd>
                            </Fragment>
                          ))}
                        </dl>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })
          )}
        </TableBody>
      </Table>
      <Pagination
        className="shrink-0"
        page={pagination.page}
        hasPrev={pagination.hasPrev && !isFetching}
        hasNext={hasMore && !isFetching}
        onPrev={pagination.goPrev}
        onNext={() => {
          const lastId = entries.at(-1)?.id;
          if (lastId) pagination.goNext(lastId);
        }}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        pageSizeLabel={t("table.pagination.rowsPerPage")}
        pageLabel={(page) => t("table.pagination.page", { page })}
        prevLabel={t("table.pagination.prevPage")}
        nextLabel={t("table.pagination.nextPage")}
      />
    </div>
  );
}
