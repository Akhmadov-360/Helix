import { z } from "zod";

const taskTitleSchema = z.string().trim().min(1).max(500);

// Зеркало Prisma-enum TaskPriority (packages/db/prisma/schema.prisma). Порядок = порядок enum
// в схеме — используется как sort key в UI (URGENT сверху, NONE снизу): UI не полагается на
// enum-order Postgres, всегда явный массив констант из этой схемы.
export const taskPrioritySchema = z.enum(["URGENT", "HIGH", "MEDIUM", "LOW", "NONE"]);
export type TaskPriority = z.infer<typeof taskPrioritySchema>;

// dueAt — момент времени; z.coerce.date() принимает ISO-строку → Date → timestamptz (§4).
// priority — optional на create (сервер применяет default NONE), null не имеет смысла (для
// «нет приоритета» есть значение NONE); поэтому .optional(), НЕ .nullish().
export const createTaskSchema = z.object({
  title: taskTitleSchema,
  dueAt: z.coerce.date().optional(),
  assigneeId: z.string().min(1).optional(),
  priority: taskPrioritySchema.optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

// done ОТСУТСТВУЕТ намеренно (§2): смена done — только через complete/reopen (пишут событие).
// .strict() → PATCH {done:true} = 400 (unknown key), НЕ тихое игнорирование. Nullable-семантика:
// null очищает (dueAt/assignee), отсутствие ключа — не трогает. Для priority null не поддерживаем:
// «убрать приоритет» = выставить NONE, не clear (см. рационализацию выше).
export const updateTaskSchema = z
  .object({
    title: taskTitleSchema.optional(),
    dueAt: z.coerce.date().nullish(),
    assigneeId: z.string().min(1).nullish(),
    priority: taskPrioritySchema.optional(),
  })
  .strict()
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "At least one field must be provided",
  });
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

// overdue — ВЫЧИСЛЯЕМОЕ поле (§4): dueAt < now() AND NOT done. Не колонка, считается на чтении.
export const taskResponseSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string(),
  done: z.boolean(),
  assigneeId: z.string().nullable(),
  dueAt: z.iso.datetime().nullable(),
  priority: taskPrioritySchema,
  overdue: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type TaskResponse = z.infer<typeof taskResponseSchema>;
