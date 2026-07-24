import { z } from "zod";
import { localizedNameSchema } from "./common";
import { phaseTypeSchema } from "./enums";

export const createPhaseSchema = z.object({
  name: localizedNameSchema,
  type: phaseTypeSchema.default("OPEN"),
  color: z.string().max(32).optional(),
});
export type CreatePhaseInput = z.infer<typeof createPhaseSchema>;

// key и order здесь отсутствуют намеренно: key иммутабелен (на нём висят автоматизации),
// order меняется только через reorder (операция над всем воркспейсом, не над строкой).
export const updatePhaseSchema = z.object({
  name: localizedNameSchema.optional(),
  type: phaseTypeSchema.optional(),
  color: z.string().max(32).optional(),
});
export type UpdatePhaseInput = z.infer<typeof updatePhaseSchema>;

// Контракт reorder — ПОЛНЫЙ желаемый порядок, а не дельта (§3 спеки).
export const reorderPhasesSchema = z.object({
  phaseIds: z.array(z.string().min(1)).min(1),
  version: z.number().int().nonnegative(),
});
export type ReorderPhasesInput = z.infer<typeof reorderPhasesSchema>;

export const deletePhaseQuerySchema = z.object({
  reassignTo: z.string().min(1).optional(),
});
export type DeletePhaseQuery = z.infer<typeof deletePhaseQuerySchema>;

export const phaseResponseSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  key: z.string(),
  name: localizedNameSchema,
  type: phaseTypeSchema,
  order: z.number().int(),
  color: z.string().nullable(),
});
export type PhaseResponse = z.infer<typeof phaseResponseSchema>;
