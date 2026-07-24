import type { Prisma } from "@helix/db";
import type { LocalizedName, PhaseResponse } from "@helix/api-schemas";

export interface PhaseRow {
  id: string;
  workspaceId: string;
  key: string;
  name: Prisma.JsonValue;
  type: PhaseResponse["type"];
  order: number;
  color: string | null;
}

export function toPhaseResponse(p: PhaseRow): PhaseResponse {
  return {
    id: p.id,
    workspaceId: p.workspaceId,
    key: p.key,
    name: p.name as LocalizedName, // jsonb; форма гарантируется на записи через Zod
    type: p.type,
    order: p.order,
    color: p.color,
  };
}
