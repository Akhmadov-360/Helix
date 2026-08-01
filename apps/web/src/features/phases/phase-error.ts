import type { PhaseResponse } from "@helix/api-schemas";
import { phaseResponseSchema } from "@helix/api-schemas";
import { z } from "zod";
import { TransportError } from "../../shared/api";

// §6.4: shared/api знает только HTTP; домен интерпретирует code внутри статуса здесь, в feature.
export type PhaseError = "versionConflict" | "permissionDenied" | "notFound" | "notEmpty" | "unexpected";

export function toPhaseError(error: unknown): PhaseError {
  if (!(error instanceof TransportError)) return "unexpected";
  if (error.kind === "conflict" && error.code === "WORKSPACE_VERSION_CONFLICT") return "versionConflict";
  if (error.kind === "conflict" && error.code === "PHASE_NOT_EMPTY") return "notEmpty";
  if (error.kind === "forbidden") return "permissionDenied";
  if (error.kind === "notFound") return "notFound";
  return "unexpected";
}

// PHASE_NOT_EMPTY.details — фазы-кандидаты для reassignTo (phases.service.ts §6). details — сеть,
// границу доверия парсим (§6.2), не доверяем вслепую.
export function phaseCandidatesFrom(error: unknown): PhaseResponse[] {
  if (!(error instanceof TransportError)) return [];
  const parsed = z.array(phaseResponseSchema).safeParse(error.details);
  return parsed.success ? parsed.data : [];
}
