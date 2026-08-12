import { z } from "zod";
import { roleSchema } from "./auth";

// Org-уровневый административный аудит (AuditLog, contacts.md §7.3, decisions.md D5) — ОТДЕЛЬНО
// от ActivityEvent (тот про ленту лида, projectId NOT NULL). Замкнутый словарь действий, строкой
// (schemaVersion — форма факта историческая, P2), общий с будущей webhook-вокабулой.
export const auditActionSchema = z.enum([
  "contact.merged",
  "membership.role_changed",
  "membership.removed",
  "organization.created",
  "invite.created",
  "invite.accepted",
  "invite.revoked",
  "organization.settings_updated",
  "security.refresh_token_reuse_detected",
]);
export type AuditAction = z.infer<typeof auditActionSchema>;

// Снапшот merge (P2/P3): что уехало из source в target — след для ручного un-merge (§7.7).
// sourceEmail nullable (у контакта могло не быть email). movedProjectContactIds — projectId
// связей, перенесённых source→target. fieldsFilledFromSource — какие поля target взял у source.
const contactMergedPayloadSchema = z.object({
  sourceId: z.string(),
  sourceName: z.string(),
  sourceEmail: z.string().nullable(),
  targetId: z.string(),
  movedProjectContactIds: z.array(z.string()),
  fieldsFilledFromSource: z.array(z.string()),
});

// Снапшот целевого юзера (P2): membership.role_changed/removed переживают уход юзера из орги —
// имя/email на МОМЕНТ действия, не живая ссылка (userId остаётся для клика в текущий профиль,
// тот же приём, что actorId в AuditLog).
const membershipRoleChangedPayloadSchema = z.object({
  userId: z.string(),
  userName: z.string(),
  userEmail: z.string(),
  fromRole: roleSchema,
  toRole: roleSchema,
});

const membershipRemovedPayloadSchema = z.object({
  userId: z.string(),
  userName: z.string(),
  userEmail: z.string(),
  role: roleSchema,
});

const organizationCreatedPayloadSchema = z.object({
  name: z.string(),
});

// invites.md §10: email+role+снапшот имени актора на момент события (P2/P3) — не userId ссылка
// на Invite (P3: минимум для истории, не денормализуем всю строку).
const inviteCreatedPayloadSchema = z.object({
  email: z.string(),
  role: roleSchema,
  invitedByName: z.string(),
});

const inviteAcceptedPayloadSchema = z.object({
  email: z.string(),
  role: roleSchema,
  acceptedByName: z.string(),
});

const inviteRevokedPayloadSchema = z.object({
  email: z.string(),
  role: roleSchema,
  revokedByName: z.string(),
});

// FR-ORG-3: только ИЗМЕНИВШИЕСЯ ключи (P3 — минимум для истории), не весь settings-блоб —
// значения могут содержать branding/URL-и, которым незачем дублироваться в аудите навечно.
// Актор резолвится на чтении через AuditLog.actorId → User (audit.repository.ts), как везде —
// без денормализованного имени в payload (в отличие от membership.*, где userName — снапшот
// ЦЕЛИ действия, не актора, и обязан пережить её уход из орги).
const organizationSettingsUpdatedPayloadSchema = z.object({
  changedKeys: z.array(z.string()),
});

// RefreshSession retention — operational, не forensic (ADR: refresh-session-retention).
// REUSE-детект уносит forensic-след сюда, в AuditLog, ИМЕННО ПОТОМУ что сама RefreshSession-строка
// живёт лишь несколько дней после смерти — без этого события инцидент был бы виден только пока
// жива строка. actorId у этого события ВСЕГДА null (см. audit.recorder.ts: null = система) —
// userId здесь НЕ актор, а ПОСТРАДАВШИЙ (см. RefreshSessionService.rotate): токен мог прийти от
// атакующего, укравшего чужой refresh, а не от самого userId. familyId — вся цепочка ротаций уже
// убита revokeFamily() в той же транзакции, что и эта запись (P4).
const securityRefreshTokenReuseDetectedPayloadSchema = z.object({
  userId: z.string(),
  familyId: z.string(),
});

// Писательский контракт AuditRecorder (валидируется перед записью). discriminatedUnion — задел
// под рост словаря без ломки существующих поколений.
export const auditEventSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("contact.merged"),
    schemaVersion: z.literal(1),
    payload: contactMergedPayloadSchema,
  }),
  z.object({
    action: z.literal("membership.role_changed"),
    schemaVersion: z.literal(1),
    payload: membershipRoleChangedPayloadSchema,
  }),
  z.object({
    action: z.literal("membership.removed"),
    schemaVersion: z.literal(1),
    payload: membershipRemovedPayloadSchema,
  }),
  z.object({
    action: z.literal("organization.created"),
    schemaVersion: z.literal(1),
    payload: organizationCreatedPayloadSchema,
  }),
  z.object({
    action: z.literal("invite.created"),
    schemaVersion: z.literal(1),
    payload: inviteCreatedPayloadSchema,
  }),
  z.object({
    action: z.literal("invite.accepted"),
    schemaVersion: z.literal(1),
    payload: inviteAcceptedPayloadSchema,
  }),
  z.object({
    action: z.literal("invite.revoked"),
    schemaVersion: z.literal(1),
    payload: inviteRevokedPayloadSchema,
  }),
  z.object({
    action: z.literal("organization.settings_updated"),
    schemaVersion: z.literal(1),
    payload: organizationSettingsUpdatedPayloadSchema,
  }),
  z.object({
    action: z.literal("security.refresh_token_reuse_detected"),
    schemaVersion: z.literal(1),
    payload: securityRefreshTokenReuseDetectedPayloadSchema,
  }),
]);
export type AuditEvent = z.infer<typeof auditEventSchema>;

// ─────────────────────────── чтение (GET /organizations/audit-log) ──────────────────────────
// Читательский контракт НЕ дискриминирован по action: payload разных действий разной формы,
// а список рендерится единой таблицей (action + JSON payload как есть) — фронт форматирует по
// словарю в i18n, не разбирая структуру. actorName/actorEmail null = актор удалён (SetNull).
export const auditLogEntryResponseSchema = z.object({
  id: z.string(),
  actorId: z.string().nullable(),
  actorName: z.string().nullable(),
  actorEmail: z.string().nullable(),
  action: auditActionSchema,
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime(),
});
export type AuditLogEntryResponse = z.infer<typeof auditLogEntryResponseSchema>;

// hasMore — тот же приём, что companyListResponseSchema: бэк берёт limit+1 строк, откусывает
// последнюю, hasMore = была ли она. Курсор для следующей страницы — id последней ОТДАННОЙ строки
// (её фронт уже знает из entries, отдельного поля под него не заводим).
export const auditLogListResponseSchema = z.object({
  entries: z.array(auditLogEntryResponseSchema),
  hasMore: z.boolean(),
});
export type AuditLogListResponse = z.infer<typeof auditLogListResponseSchema>;

export const auditLogQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  action: auditActionSchema.optional(),
});
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
