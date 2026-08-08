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

export const auditLogListResponseSchema = z.array(auditLogEntryResponseSchema);
export type AuditLogListResponse = z.infer<typeof auditLogListResponseSchema>;

export const auditLogQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
