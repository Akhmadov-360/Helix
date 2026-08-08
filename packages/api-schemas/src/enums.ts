import { z } from "zod";

// Зеркала доменных enum'ов из schema.prisma для фронт-контракта (Prisma-клиент фронт
// не подключает). Совместимость с доменом стережёт компиляционный страж в apps/api.
export const audienceSchema = z.enum(["B2B", "B2C", "MIXED"]);
export type Audience = z.infer<typeof audienceSchema>;

export const phaseTypeSchema = z.enum(["OPEN", "WON", "LOST"]);
export type PhaseType = z.infer<typeof phaseTypeSchema>;

export const fieldTypeSchema = z.enum([
  "text",
  "longtext",
  "number",
  "currency",
  "date",
  "datetime",
  "select",
  "multiselect",
  "boolean",
  "url",
  "email",
  "phone",
  "contactRef",
  "companyRef",
  "userRef",
]);
export type FieldType = z.infer<typeof fieldTypeSchema>;
