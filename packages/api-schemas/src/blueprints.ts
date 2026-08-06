import { z } from "zod";
import { localizedNameSchema } from "./common";
import { audienceSchema, fieldTypeSchema, phaseTypeSchema } from "./enums";

// §2: key обязателен и берётся буквально при инстанцировании (P1 — "blueprint-ссылки → key"),
// не генерируется заново по алгоритму phase-key.ts/field-key.ts.
export const blueprintPhaseSchema = z.object({
  key: z.string().min(1),
  name: localizedNameSchema,
  type: phaseTypeSchema,
  order: z.number().int().positive(),
});
export type BlueprintPhase = z.infer<typeof blueprintPhaseSchema>;

export const blueprintFieldSchema = z.object({
  key: z.string().min(1),
  label: localizedNameSchema,
  type: fieldTypeSchema,
  options: z.array(z.string().min(1)).optional(),
  required: z.boolean().optional(),
});
export type BlueprintField = z.infer<typeof blueprintFieldSchema>;

// §3.1: тот же узкий подключ, что notifications.md §4 уже умеет читать из Workspace.settings.
export const notificationDefaultsSchema = z.object({
  newLead: z
    .object({
      email: z.boolean(),
      recipients: z.array(z.enum(["owner", "assignees"])),
    })
    .optional(),
});
export type NotificationDefaults = z.infer<typeof notificationDefaultsSchema>;

// pageTemplates/kbSeed/automations: валидны, НЕ реализованы (§0) — принимаем как непрозрачный JSON,
// инстанцирование (workspaces.service.ts) их игнорирует, ничего не отбрасываем на схеме.
export const blueprintDefinitionSchema = z.object({
  phases: z.array(blueprintPhaseSchema).min(1),
  projectFields: z.array(blueprintFieldSchema),
  notificationDefaults: notificationDefaultsSchema.optional(),
  pageTemplates: z.array(z.unknown()).optional(),
  kbSeed: z.array(z.unknown()).optional(),
  automations: z.array(z.unknown()).optional(),
});
export type BlueprintDefinition = z.infer<typeof blueprintDefinitionSchema>;

export const createBlueprintFromWorkspaceSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().trim().min(1).max(200),
  audience: audienceSchema,
});
export type CreateBlueprintFromWorkspaceInput = z.infer<typeof createBlueprintFromWorkspaceSchema>;

export const blueprintQuerySchema = z.object({
  audience: audienceSchema.optional(),
});
export type BlueprintQuery = z.infer<typeof blueprintQuerySchema>;

export const blueprintResponseSchema = z.object({
  id: z.string(),
  orgId: z.string().nullable(), // null = системный (§4)
  audience: audienceSchema,
  name: z.string(),
  definition: blueprintDefinitionSchema,
  createdAt: z.iso.datetime(),
});
export type BlueprintResponse = z.infer<typeof blueprintResponseSchema>;
