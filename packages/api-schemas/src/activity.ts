import { z } from "zod";
import { localizedNameSchema } from "./common";

// Замкнутый словарь типов событий (§6.3). Общий с webhook-вокабулой (M5). Строкой,
// не enum в БД — форма факта историческая (schemaVersion), не миграция на каждый тип.
export const projectEventTypeSchema = z.enum([
  "project.created",
  "project.moved",
  "project.archived",
  "project.restored",
  "project.updated",
  "project.reassigned",
  "task.created",
  "task.completed",
  "attachment.uploaded",
  "attachment.deleted",
  "page.created",
  "page.deleted",
]);
export type ProjectEventType = z.infer<typeof projectEventTypeSchema>;

// Payload = СНАПШОТ (P2+P3): ссылки по key + минимум, без живого FK на Phase → событие
// переживает удаление фазы. actorName снапшотится (John остаётся John).
const actorOnlyPayload = z.object({ actorName: z.string().nullable() });

const movedPayload = z.object({
  fromPhaseKey: z.string(),
  fromPhaseName: localizedNameSchema,
  toPhaseKey: z.string(),
  toPhaseName: localizedNameSchema,
  actorName: z.string().nullable(),
});

const updatedPayload = z.object({
  changed: z.array(z.string()), // значимые поля (value; owner вынесен в project.reassigned) — §6.3
  actorName: z.string().nullable(),
});

// reassign — именованный бизнес-факт (project-links.md §6.3), не «изменил поле owner». Снапшот
// ИМЁН (P2/P3), не id: событие читается через год, когда User мог быть погашен. fromOwnerName
// nullable = лид был в пуле («взят из пула»), toOwnerName nullable = возвращён в пул.
const reassignedPayload = z.object({
  fromOwnerName: z.string().nullable(),
  toOwnerName: z.string().nullable(),
  actorName: z.string().nullable(),
});

// task.created/completed (tasks.md §5). Снапшот (P2/P3): taskTitle + assigneeName, без живого FK.
// taskId — для «перейти к задаче» из ленты позже, без миграции payload. assigneeName nullable.
const taskEventPayload = z.object({
  taskId: z.string(),
  taskTitle: z.string(),
  assigneeName: z.string().nullable(),
  actorName: z.string().nullable(),
});

// attachment.uploaded/deleted (files.md) — только "структурные" события (загрузка/удаление файла),
// не rename/переименование: тот же порог, что у задач ("веха", не каждое поле-изменение). Снапшот
// filename (P2/P3) — переживает удаление Attachment-строки при cascade-очистке проекта.
const attachmentEventPayload = z.object({
  attachmentId: z.string(),
  filename: z.string(),
  actorName: z.string().nullable(),
});

// page.created/deleted (pages-kb.md) — тот же принцип: создание/удаление документа веха, правки
// контента/автосейв — нет (иначе лента захлебнётся). Снапшот pageTitle — переживает удаление Page.
const pageEventPayload = z.object({
  pageId: z.string(),
  pageTitle: z.string(),
  actorName: z.string().nullable(),
});

// Discriminated union по (type, schemaVersion) — писательский контракт ActivityRecorder.
export const projectEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("project.created"), schemaVersion: z.literal(1), payload: actorOnlyPayload }),
  z.object({ type: z.literal("project.moved"), schemaVersion: z.literal(1), payload: movedPayload }),
  z.object({ type: z.literal("project.archived"), schemaVersion: z.literal(1), payload: actorOnlyPayload }),
  z.object({ type: z.literal("project.restored"), schemaVersion: z.literal(1), payload: actorOnlyPayload }),
  z.object({ type: z.literal("project.updated"), schemaVersion: z.literal(1), payload: updatedPayload }),
  z.object({ type: z.literal("project.reassigned"), schemaVersion: z.literal(1), payload: reassignedPayload }),
  z.object({ type: z.literal("task.created"), schemaVersion: z.literal(1), payload: taskEventPayload }),
  z.object({ type: z.literal("task.completed"), schemaVersion: z.literal(1), payload: taskEventPayload }),
  z.object({ type: z.literal("attachment.uploaded"), schemaVersion: z.literal(1), payload: attachmentEventPayload }),
  z.object({ type: z.literal("attachment.deleted"), schemaVersion: z.literal(1), payload: attachmentEventPayload }),
  z.object({ type: z.literal("page.created"), schemaVersion: z.literal(1), payload: pageEventPayload }),
  z.object({ type: z.literal("page.deleted"), schemaVersion: z.literal(1), payload: pageEventPayload }),
]);
export type ProjectEvent = z.infer<typeof projectEventSchema>;

// Ответ GET /activity. payload оставлен unknown: фронт читает ВСЕ поколения событий
// (P2), включая будущие типы с graceful fallback — строгий разбор известных через
// projectEventSchema на стороне клиента.
export const activityEventResponseSchema = z.object({
  id: z.string(),
  type: z.string(),
  schemaVersion: z.number().int(),
  actorId: z.string().nullable(),
  payload: z.unknown(),
  createdAt: z.iso.datetime(),
});
export type ActivityEventResponse = z.infer<typeof activityEventResponseSchema>;
