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
    case "organization.settings_updated":
      return t("settings.auditLog.action.settingsUpdated", {
        count: Array.isArray(payload.changedKeys) ? payload.changedKeys.length : 0,
      });
    case "invite.created":
      return t("settings.auditLog.action.inviteCreated", { email: String(payload.email ?? "") });
    case "invite.accepted":
      return t("settings.auditLog.action.inviteAccepted", { email: String(payload.email ?? "") });
    case "invite.revoked":
      return t("settings.auditLog.action.inviteRevoked", { email: String(payload.email ?? "") });
    case "security.refresh_token_reuse_detected":
      return t("settings.auditLog.action.refreshTokenReuse");
    default:
      return entry.action;
  }
}

// Разворачиваемые детали строки — те же данные payload, что и в summary, но полностью (email,
// роль, кто выполнил и т.п.), не сжатые в одну строку. Пары "подпись: значение", а не сырой JSON —
// summary уже показывает главное, detail не должен заставлять читать структуру самому.
export function auditLogDetails(entry: AuditLogEntryResponse, t: TFunction): { label: string; value: string }[] {
  const payload = entry.payload as Record<string, unknown>;
  const str = (key: string): string => String(payload[key] ?? "");
  const role = (key: string): string => t(`role.${str(key)}` as MessageKey);
  const D = (label: MessageKey, value: string) => ({ label: t(label), value });

  switch (entry.action) {
    case "membership.role_changed":
      return [
        D("settings.auditLog.detail.user", `${str("userName")} (${str("userEmail")})`),
        D("settings.auditLog.detail.fromRole", role("fromRole")),
        D("settings.auditLog.detail.toRole", role("toRole")),
      ];
    case "membership.removed":
      return [
        D("settings.auditLog.detail.user", `${str("userName")} (${str("userEmail")})`),
        D("settings.auditLog.detail.role", role("role")),
      ];
    case "organization.created":
      return [D("settings.auditLog.detail.name", str("name"))];
    case "contact.merged":
      return [
        D("settings.auditLog.detail.source", `${str("sourceName")} (${str("sourceEmail")})`),
        D(
          "settings.auditLog.detail.fieldsFilled",
          Array.isArray(payload.fieldsFilledFromSource) ? payload.fieldsFilledFromSource.join(", ") : "—",
        ),
      ];
    case "invite.created":
      return [
        D("settings.auditLog.detail.email", str("email")),
        D("settings.auditLog.detail.role", role("role")),
        D("settings.auditLog.detail.invitedBy", str("invitedByName")),
      ];
    case "invite.accepted":
      return [
        D("settings.auditLog.detail.email", str("email")),
        D("settings.auditLog.detail.role", role("role")),
      ];
    case "invite.revoked":
      return [
        D("settings.auditLog.detail.email", str("email")),
        D("settings.auditLog.detail.revokedBy", str("revokedByName")),
      ];
    case "organization.settings_updated":
      return [
        D(
          "settings.auditLog.detail.changedKeys",
          Array.isArray(payload.changedKeys) ? payload.changedKeys.join(", ") : "—",
        ),
      ];
    case "security.refresh_token_reuse_detected":
      return [D("settings.auditLog.detail.affectedUser", str("userId"))];
    default:
      return [];
  }
}
