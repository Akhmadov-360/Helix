import { z } from "zod";
import { dealLinkSchema } from "./common";

// Email контакта: trim (пробелы в email не значимы), но регистр СОХРАНЯЕМ — это PII, показываем
// как ввёл оператор. Нормализация (lower) живёт только в emailNormalized на сервере (§4.2), не тут.
export const contactEmailSchema = z.string().trim().pipe(z.email());

const contactNameSchema = z.string().trim().min(1).max(200);
const phoneSchema = z.string().trim().min(1).max(50);

export const createContactSchema = z.object({
  name: contactNameSchema,
  email: contactEmailSchema.optional(),
  phone: phoneSchema.optional(),
  companyId: z.string().min(1).optional(),
});
export type CreateContactInput = z.infer<typeof createContactSchema>;

// Nullable-семантика (§3): null = очистить поле, отсутствие ключа = не трогать. name нельзя
// занулить (required в домене) → только optional. email/phone/companyId → nullish.
export const updateContactSchema = z
  .object({
    name: contactNameSchema.optional(),
    email: contactEmailSchema.nullish(),
    phone: phoneSchema.nullish(),
    companyId: z.string().min(1).nullish(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "At least one field must be provided",
  });
export type UpdateContactInput = z.infer<typeof updateContactSchema>;

// Явная проверка дубля до создания (§4.2). Query — email нормализуется на сервере для lookup.
export const dedupCheckSchema = z.object({ email: contactEmailSchema });
export type DedupCheckQuery = z.infer<typeof dedupCheckSchema>;

// Тело POST /:targetId/merge — source вливается в target из пути (§7).
export const mergeContactSchema = z.object({ sourceId: z.string().min(1) });
export type MergeContactInput = z.infer<typeof mergeContactSchema>;

// Список: keyset по id (стабилен, §4.1), не OFFSET. q — поиск по name/email; companyId — фильтр.
export const contactQuerySchema = z.object({
  q: z.string().trim().min(1).optional(),
  companyId: z.string().min(1).optional(),
  cursorId: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
});
export type ContactQuery = z.infer<typeof contactQuerySchema>;

// emailNormalized НЕ в ответе (§4.4 — внутреннее поле дедупа).
// mergedIntoId НЕ в ответе для активных (§7.5 — всплывает только в 410-детали).
export const contactResponseSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  companyId: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  // Взаимоисключающе опционально, как Workspace.phases/phaseCount: только list() джойнит и
  // заполняет (глобальная адресная книга должна показывать, к каким сделкам привязан контакт),
  // create/update/getById/merge — нет (P3, не тянуть лишний join там, где он не нужен).
  projects: z.array(dealLinkSchema).optional(),
});
export type ContactResponse = z.infer<typeof contactResponseSchema>;

// Кандидат дубля (§4.2): минимум для «возможно, это тот же человек». companyName — денорм
// для UI (не гоняем клиента за компанией отдельным запросом).
export const dedupHintSchema = z.object({
  candidates: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      email: z.string().nullable(),
      companyName: z.string().optional(),
    }),
  ),
});
export type DedupHint = z.infer<typeof dedupHintSchema>;

// POST /contacts → контакт создан + хинт (не блокирует, §4.1). Клиент решает, показать ли дубль.
export const createContactResponseSchema = z.object({
  contact: contactResponseSchema,
  dedupHint: dedupHintSchema,
});
export type CreateContactResponse = z.infer<typeof createContactResponseSchema>;

export const contactListResponseSchema = z.object({
  contacts: z.array(contactResponseSchema),
  hasMore: z.boolean(),
});
export type ContactListResponse = z.infer<typeof contactListResponseSchema>;
