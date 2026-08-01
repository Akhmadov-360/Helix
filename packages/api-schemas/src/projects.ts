import { z } from "zod";
import { phaseResponseSchema } from "./phases";

// ISO-4217: три заглавные буквы. Не enum (~180 валют), не свободная строка («LOL»).
export const currencySchema = z.string().regex(/^[A-Z]{3}$/, "ISO-4217 3-letter code");

export const projectStatusSchema = z.enum(["OPEN", "WON", "LOST", "ARCHIVED"]);
export type ProjectStatus = z.infer<typeof projectStatusSchema>;

// fields ОТСУТСТВУЕТ намеренно (§11): FieldDefinition CRUD ещё нет → валидировать нечем.
export const createProjectSchema = z.object({
  title: z.string().trim().min(1).max(500),
  value: z.number().nonnegative().optional(),
  currency: currencySchema.optional(),
  source: z.string().trim().max(200).optional(),
  companyId: z.string().min(1).optional(),
  ownerId: z.string().min(1).optional(),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

// phaseId/rank/status НЕ принимаются: фазу/позицию меняет только move, статус — производная
// от фазы (§6.1); второй путь развалил бы синхрон.
// ownerId НЕ принимается: reassign — отдельная операция с иными правами (Manager+, матрица
// «Reassign leads»), не поле общего edit (Member+). Смена владельца меняет будущий scope
// (visibility=ASSIGNED, M6) → capability строже. Отдельный эндпоинт POST /:id/reassign.
export const updateProjectSchema = createProjectSchema
  .omit({ ownerId: true })
  .partial()
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "At least one field must be provided",
  });
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

// Переназначение владельца лида — первоклассная операция (Manager+). null = снять владельца.
export const reassignProjectSchema = z.object({
  ownerId: z.string().min(1).nullable(),
});
export type ReassignProjectInput = z.infer<typeof reassignProjectSchema>;

// Соседи по id, не по индексу/рангу (§4.1): позиция нестабильна, ранг утёк бы во фронт.
// null = «явно с краю», undefined = «не указано» → дефолт наверх.
export const moveProjectSchema = z.object({
  toPhaseId: z.string().min(1),
  afterId: z.string().min(1).nullish(),
  beforeId: z.string().min(1).nullish(),
});
export type MoveProjectInput = z.infer<typeof moveProjectSchema>;

export const boardQuerySchema = z.object({
  limitPerPhase: z.coerce.number().int().positive().max(100).default(50),
});
export type BoardQuery = z.infer<typeof boardQuerySchema>;

// Keyset-курсор (rank, id) — не OFFSET: при неуникальном ранге offset недетерминирован (§8).
export const columnQuerySchema = z.object({
  cursorRank: z.string().optional(),
  cursorId: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
});
export type ColumnQuery = z.infer<typeof columnQuerySchema>;

export const projectResponseSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  phaseId: z.string(),
  title: z.string(),
  status: projectStatusSchema,
  // value — Decimal(14,2); в пределах диапазона безопасно как number (макс ~10^14 < 2^53).
  value: z.number().nullable(),
  currency: z.string().nullable(),
  source: z.string().nullable(),
  companyId: z.string().nullable(),
  ownerId: z.string().nullable(),
  rank: z.string(), // отдаётся для курсора, но НЕ принимается ни одним эндпоинтом (§4)
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ProjectResponse = z.infer<typeof projectResponseSchema>;

// Расширение ТОЛЬКО для доски/колонки (не всего ProjectResponse — move/reassign/archive/restore
// его тоже возвращают, пересчитывать агрегаты на каждой такой мутации незачем, P3).
export const boardProjectResponseSchema = projectResponseSchema.extend({
  doneTasksCount: z.number().int().nonnegative(),
  totalTasksCount: z.number().int().nonnegative(),
  assignees: z.array(z.object({ userId: z.string(), name: z.string() })),
});
export type BoardProjectResponse = z.infer<typeof boardProjectResponseSchema>;

// Колонка доски: фаза + ограниченная выборка карточек + total (отдельный COUNT) + hasMore (§8).
export const boardColumnSchema = phaseResponseSchema.extend({
  total: z.number().int(),
  projects: z.array(boardProjectResponseSchema),
  hasMore: z.boolean(),
});
export type BoardColumn = z.infer<typeof boardColumnSchema>;

export const boardResponseSchema = z.object({
  workspaceId: z.string(),
  version: z.number().int(),
  phases: z.array(boardColumnSchema),
});
export type BoardResponse = z.infer<typeof boardResponseSchema>;

// Догрузка колонки: страница карточек + hasMore. Курсор для следующей — (rank, id)
// последней карточки страницы (клиент берёт из неё). Тот же boardProjectResponseSchema, что и
// доска (§13.4) — страница дозаписывается в тот же кэш board, форма должна совпадать.
export const columnResponseSchema = z.object({
  projects: z.array(boardProjectResponseSchema),
  hasMore: z.boolean(),
});
export type ColumnResponse = z.infer<typeof columnResponseSchema>;
