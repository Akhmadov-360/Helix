import { z } from "zod";
import { localizedNameSchema } from "./common";
import { fieldTypeSchema, type FieldType } from "./enums";

// custom-fields.md §2: options обязателен (непустой массив строк) для select/multiselect,
// отсутствует/игнорируется для остальных типов.
const baseCreateFieldSchema = z.object({
  label: localizedNameSchema,
  type: fieldTypeSchema,
  options: z.array(z.string().min(1)).optional(),
  required: z.boolean().default(false),
});

export const createFieldDefinitionSchema = baseCreateFieldSchema.superRefine((v, ctx) => {
  const needsOptions = v.type === "select" || v.type === "multiselect";
  if (needsOptions && (!v.options || v.options.length === 0)) {
    ctx.addIssue({ code: "custom", message: "options is required for select/multiselect", path: ["options"] });
  }
});
export type CreateFieldDefinitionInput = z.infer<typeof createFieldDefinitionSchema>;

// §5: type редактируется только через allow-list (проверка в сервисе — набор целей зависит
// от ТЕКУЩЕГО типа поля, недоступного схеме на уровне пайпа).
export const updateFieldDefinitionSchema = z
  .object({
    label: localizedNameSchema.optional(),
    options: z.array(z.string().min(1)).optional(),
    required: z.boolean().optional(),
    type: fieldTypeSchema.optional(),
  })
  .superRefine((v, ctx) => {
    if ((v.type === "select" || v.type === "multiselect") && (!v.options || v.options.length === 0)) {
      ctx.addIssue({ code: "custom", message: "options is required for select/multiselect", path: ["options"] });
    }
  });
export type UpdateFieldDefinitionInput = z.infer<typeof updateFieldDefinitionSchema>;

export const fieldDefinitionResponseSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  key: z.string(),
  label: localizedNameSchema,
  type: fieldTypeSchema,
  options: z.array(z.string()).nullable(),
  required: z.boolean(),
});
export type FieldDefinitionResponse = z.infer<typeof fieldDefinitionResponseSchema>;

// §5: явный allow-list вместо эвристики — «безопасную (сужение до строки) смену разрешаем,
// несовместимую запрещаем». Отсутствие ключа/пустой массив = смена типа для этого type запрещена.
const ALLOWED_TYPE_CHANGES: Record<FieldType, FieldType[]> = {
  text: ["longtext"],
  longtext: [],
  number: ["text"],
  currency: ["text"],
  date: ["text"],
  datetime: ["text"],
  boolean: ["text"],
  url: ["text"],
  email: ["text"],
  phone: ["text"],
  select: [],
  multiselect: [],
  contactRef: [],
  companyRef: [],
  userRef: [],
};

export function isCompatibleFieldTypeChange(from: FieldType, to: FieldType): boolean {
  return from === to || ALLOWED_TYPE_CHANGES[from].includes(to);
}

// §4: Zod для одного значения по типу поля. select/multiselect проверяются против
// FieldDefinition.options текущего поля (замкнутое множество, как dealRoleSchema).
function fieldValueSchema(def: FieldDefinitionResponse): z.ZodTypeAny {
  switch (def.type) {
    case "text":
    case "longtext":
    case "phone":
      return z.string();
    case "number":
    case "currency":
      return z.number();
    case "date":
      return z.iso.date();
    case "datetime":
      return z.iso.datetime();
    case "boolean":
      return z.boolean();
    case "url":
      return z.url();
    case "email":
      return z.email();
    case "select":
      return z.enum((def.options ?? []) as [string, ...string[]]);
    case "multiselect":
      return z.array(z.enum((def.options ?? []) as [string, ...string[]]));
    case "contactRef":
    case "companyRef":
    case "userRef":
      // Целостность — на уровне приложения, не FK (dangling id тератируем, decisions.md).
      return z.string().min(1);
  }
}

// custom-fields.md §10 шаг 1: динамическая Zod-схема, собранная из текущего набора полей
// воркспейса. Лишние ключи (не входящие в definitions) молча отбрасываются — z.object()
// по умолчанию strip'ает неизвестные ключи (§4: «мягкая деградация формы»).
export function buildProjectFieldsSchema(definitions: FieldDefinitionResponse[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const def of definitions) {
    shape[def.key] = fieldValueSchema(def).optional();
  }
  return z.object(shape);
}

// §7: required enforcement — вызывается ПОСЛЕ успешного type-парсинга (buildProjectFieldsSchema),
// на итоговом (смёрженном) наборе значений. Возвращает ключи required-полей без значения.
export function missingRequiredFieldKeys(
  definitions: FieldDefinitionResponse[],
  fields: Record<string, unknown>,
): string[] {
  return definitions.filter((d) => d.required && fields[d.key] === undefined).map((d) => d.key);
}
