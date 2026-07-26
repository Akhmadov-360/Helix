import { z } from "zod";

// Org-уровневый административный аудит (AuditLog, contacts.md §7.3) — ОТДЕЛЬНО от ActivityEvent
// (тот про ленту лида, projectId NOT NULL). Замкнутый словарь действий, строкой (schemaVersion —
// форма факта историческая, P2), общий с будущей webhook-вокабулой.
export const auditActionSchema = z.enum(["contact.merged"]);
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

// Писательский контракт AuditRecorder (валидируется перед записью). Один action сейчас;
// discriminatedUnion — задел под рост словаря без ломки существующих поколений.
export const auditEventSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("contact.merged"),
    schemaVersion: z.literal(1),
    payload: contactMergedPayloadSchema,
  }),
]);
export type AuditEvent = z.infer<typeof auditEventSchema>;
