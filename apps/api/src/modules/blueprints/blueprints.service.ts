import { Injectable } from "@nestjs/common";
import type { Prisma } from "@helix/db";
import type {
  Audience,
  BlueprintDefinition,
  BlueprintResponse,
  CreateBlueprintFromWorkspaceInput,
  LocalizedName,
} from "@helix/api-schemas";
import { ResourceNotFoundError } from "../../core/errors/domain-error";
import { toBlueprintResponse } from "./blueprint.mapper";
import { BlueprintsRepository } from "./blueprints.repository";

@Injectable()
export class BlueprintsService {
  constructor(private readonly blueprints: BlueprintsRepository) {}

  async list(orgId: string, audience?: Audience): Promise<BlueprintResponse[]> {
    const rows = await this.blueprints.list(orgId, audience);
    return rows.map(toBlueprintResponse);
  }

  // FR-BP-4 (§9): снапшот ТЕКУЩЕГО состава воркспейса — не живая ссылка. Последующая правка
  // исходного воркспейса не задевает уже сохранённый блюпринт (симметрично §3 в обратную сторону).
  async createFromWorkspace(orgId: string, input: CreateBlueprintFromWorkspaceInput): Promise<BlueprintResponse> {
    const snapshot = await this.blueprints.findWorkspaceSnapshotSource(input.workspaceId, orgId);
    if (!snapshot) throw new ResourceNotFoundError("Workspace not found");

    const definition: BlueprintDefinition = {
      phases: snapshot.phases.map((p) => ({
        key: p.key,
        name: p.name as LocalizedName,
        type: p.type,
        order: p.order,
      })),
      projectFields: snapshot.fields.map((f) => ({
        key: f.key,
        label: f.label as LocalizedName,
        type: f.type,
        options: (f.options as string[] | null) ?? undefined,
        required: f.required,
      })),
    };

    const row = await this.blueprints.create({
      orgId,
      audience: input.audience,
      name: input.name,
      definition: definition as Prisma.InputJsonValue,
    });
    return toBlueprintResponse(row);
  }

  // §6: только свой org-private — findOwnById не видит системные, чужой/несуществующий → 404
  // (не 403, тот же IDOR-принцип, что везде).
  async remove(orgId: string, id: string): Promise<void> {
    const row = await this.blueprints.findOwnById(id, orgId);
    if (!row) throw new ResourceNotFoundError("Blueprint not found");
    await this.blueprints.delete(id);
  }
}
