import type { Prisma } from "@helix/db";
import type { Audience, BlueprintDefinition, BlueprintResponse } from "@helix/api-schemas";

export interface BlueprintRow {
  id: string;
  orgId: string | null;
  audience: Audience;
  name: string;
  definition: Prisma.JsonValue;
  createdAt: Date;
}

// definition — jsonb; форма гарантируется на записи через Zod (тот же приём, что
// field.mapper.ts для label/options), повторный parse на чтении не заводим.
export function toBlueprintResponse(row: BlueprintRow): BlueprintResponse {
  return {
    id: row.id,
    orgId: row.orgId,
    audience: row.audience,
    name: row.name,
    definition: row.definition as BlueprintDefinition,
    createdAt: row.createdAt.toISOString(),
  };
}
