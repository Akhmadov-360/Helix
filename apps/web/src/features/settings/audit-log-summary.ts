import type { AuditLogEntryResponse } from "@helix/api-schemas";
import type { MessageKey, TFunction } from "../../shared/i18n";

// Единая точка форматирования "action + payload → человекочитаемая строка" (i18n, без разбора
// структуры на стороне компонента) — тот же приём, что fieldTypeLabelKey/workspaceErrorKey.
export function auditLogSummary(entry: AuditLogEntryResponse, t: TFunction): string {
  const payload = entry.payload as Record<string, unknown>;

  switch (entry.action) {
    case "membership.role_changed":
      return t("settings.auditLog.action.roleChanged", {
        name: String(payload.userName ?? ""),
        fromRole: t(`role.${payload.fromRole as string}` as MessageKey),
        toRole: t(`role.${payload.toRole as string}` as MessageKey),
      });
    case "membership.removed":
      return t("settings.auditLog.action.memberRemoved", { name: String(payload.userName ?? "") });
    case "organization.created":
      return t("settings.auditLog.action.orgCreated", { name: String(payload.name ?? "") });
    case "contact.merged":
      return t("settings.auditLog.action.contactMerged", {
        source: String(payload.sourceName ?? ""),
        target: String(payload.targetId ?? ""),
      });
    default:
      return entry.action;
  }
}
