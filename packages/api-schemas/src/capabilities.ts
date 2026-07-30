import { z } from "zod";

// Зеркало APP_SUBJECTS/APP_ACTIONS (apps/api/core/authz/app-ability.ts) — та же дублирующая
// стратегия, что roleSchema/audienceSchema: фронт не подключает CASL-типы бэка, контракт живёт
// здесь. "all" (subject) и "manage" (action) НЕ входят — оба чисто CASL-грант-шорткаты, ни один
// @CheckPolicy их не проверяет напрямую (frontend-architecture.md §8.2): конкретные actions уже
// резолвятся true там, где роли выдан "manage".
export const capabilitySubjectSchema = z.enum([
  "Workspace",
  "Phase",
  "Project",
  "Company",
  "Contact",
  "ProjectContact",
  "ProjectAssignee",
  "Task",
]);
export type CapabilitySubject = z.infer<typeof capabilitySubjectSchema>;

export const capabilityActionSchema = z.enum(["create", "read", "update", "delete", "merge", "reassign"]);
export type CapabilityAction = z.infer<typeof capabilityActionSchema>;

// "Subject.action" — плоский список разрешённых пар (§8.2), НЕ матрица: только то, что
// ability.can() реально вернул true, без cartesian product и false-шума.
export const capabilitySchema = z.templateLiteral([capabilitySubjectSchema, ".", capabilityActionSchema]);
export type Capability = z.infer<typeof capabilitySchema>;

export const capabilitiesSchema = z.array(capabilitySchema);
export type Capabilities = z.infer<typeof capabilitiesSchema>;
