import { z } from "zod";

const taskTitleSchema = z.string().trim().min(1).max(500);

// dueAt — момент времени; z.coerce.date() принимает ISO-строку → Date → timestamptz (§4).
export const createTaskSchema = z.object({
  title: taskTitleSchema,
  dueAt: z.coerce.date().optional(),
  assigneeId: z.string().min(1).optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

// done ОТСУТСТВУЕТ намеренно (§2): смена done — только через complete/reopen (пишут событие).
// .strict() → PATCH {done:true} = 400 (unknown key), НЕ тихое игнорирование. Nullable-семантика:
// null очищает (dueAt/assignee), отсутствие ключа — не трогает.
export const updateTaskSchema = z
  .object({
    title: taskTitleSchema.optional(),
    dueAt: z.coerce.date().nullish(),
    assigneeId: z.string().min(1).nullish(),
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
  overdue: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type TaskResponse = z.infer<typeof taskResponseSchema>;
