import { z } from "zod";
import { contactLinkSchema, dealLinkSchema } from "./common";
import { contactResponseSchema } from "./contacts";

const companyNameSchema = z.string().trim().min(1).max(200);
const domainSchema = z.string().trim().min(1).max(253); // RFC-1035 макс длина домена
const industrySchema = z.string().trim().min(1).max(100);

export const createCompanySchema = z.object({
  name: companyNameSchema,
  domain: domainSchema.optional(),
  industry: industrySchema.optional(),
});
export type CreateCompanyInput = z.infer<typeof createCompanySchema>;

// Nullable-семантика как у контакта (§3): null = очистить, отсутствие = не трогать.
export const updateCompanySchema = z
  .object({
    name: companyNameSchema.optional(),
    domain: domainSchema.nullish(),
    industry: industrySchema.nullish(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "At least one field must be provided",
  });
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;

export const companyQuerySchema = z.object({
  q: z.string().trim().min(1).optional(),
  // Точное совпадение (не text-search как q) — фильтр "Индустрия", не свободный поиск.
  industry: industrySchema.optional(),
  cursorId: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
});
export type CompanyQuery = z.infer<typeof companyQuerySchema>;

// domainNormalized НЕ в ответе (внутреннее поле дедупа компаний, аналогично §4.4).
export const companyResponseSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  name: z.string(),
  domain: z.string().nullable(),
  industry: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  // Взаимоисключающе опционально (как ContactResponse.projects) — только list() джойнит:
  // Project.companyId → RESTRICT (миграция init), список должен показывать, какие сделки
  // блокируют удаление, ДО того как юзер получит 409.
  projects: z.array(dealLinkSchema).optional(),
  // Тоже только list() — превью контактов компании (avatar-стек + popover), полный список с
  // управлением живёт на companyDetailResponseSchema.contacts (полный Contact, ниже).
  contacts: z.array(contactLinkSchema).optional(),
});
export type CompanyResponse = z.infer<typeof companyResponseSchema>;

// GET /companies/:id — карточка + её контакты (§2).
export const companyDetailResponseSchema = companyResponseSchema.extend({
  contacts: z.array(contactResponseSchema),
});
export type CompanyDetailResponse = z.infer<typeof companyDetailResponseSchema>;

export const companyListResponseSchema = z.object({
  companies: z.array(companyResponseSchema),
  hasMore: z.boolean(),
});
export type CompanyListResponse = z.infer<typeof companyListResponseSchema>;

// Дедуп по домену (FR-CC-4, тот же паттерн, что contacts.ts dedupHintSchema) — кандидат минимум
// для «возможно, эта компания уже есть».
export const companyDedupHintSchema = z.object({
  candidates: z.array(z.object({ id: z.string(), name: z.string(), domain: z.string().nullable() })),
});
export type CompanyDedupHint = z.infer<typeof companyDedupHintSchema>;

// POST /companies → компания создана + хинт (не блокирует, §4.1, как createContactResponseSchema).
export const createCompanyResponseSchema = z.object({
  company: companyResponseSchema,
  dedupHint: companyDedupHintSchema,
});
export type CreateCompanyResponse = z.infer<typeof createCompanyResponseSchema>;
