import { z } from "zod";
import { audienceSchema } from "./enums";
import { phaseResponseSchema } from "./phases";

// Workspace.name — простая строка (как Organization.name), НЕ LocalizedName:
// локализуется только Phase.name (колонки доски). См. schema.prisma.
const settingsSchema = z.record(z.string(), z.unknown());

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(200),
  audience: audienceSchema.optional(),
  settings: settingsSchema.optional(),
  // blueprints.md §3: опционально — без него поведение не меняется (DEFAULT_PHASES, как раньше).
  blueprintId: z.string().min(1).optional(),
});
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;

export const updateWorkspaceSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    audience: audienceSchema.optional(),
    settings: settingsSchema.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "At least one field must be provided",
  });
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;

export const workspaceResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  audience: audienceSchema,
  settings: settingsSchema,
  version: z.number().int(),
  createdAt: z.iso.datetime(),
  // Взаимоисключающи: детальный ответ несёт phases[], список — phaseCount (§1 спеки).
  phases: z.array(phaseResponseSchema).optional(),
  phaseCount: z.number().int().optional(),
});
export type WorkspaceResponse = z.infer<typeof workspaceResponseSchema>;
