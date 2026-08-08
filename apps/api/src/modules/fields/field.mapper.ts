import type { Prisma } from "@helix/db";
import type { FieldDefinitionResponse, LocalizedName } from "@helix/api-schemas";

export interface FieldDefinitionRow {
  id: string;
  workspaceId: string;
  key: string;
  label: Prisma.JsonValue;
  type: FieldDefinitionResponse["type"];
  options: Prisma.JsonValue;
  required: boolean;
}

export function toFieldDefinitionResponse(f: FieldDefinitionRow): FieldDefinitionResponse {
  return {
    id: f.id,
    workspaceId: f.workspaceId,
    key: f.key,
    label: f.label as LocalizedName, // jsonb; форма гарантируется на записи через Zod
    type: f.type,
    options: (f.options as string[] | null) ?? null,
    required: f.required,
  };
}
