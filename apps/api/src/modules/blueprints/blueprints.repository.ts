import { Injectable } from "@nestjs/common";
import type { Prisma } from "@helix/db";
import type { Audience, PhaseType, FieldType } from "@helix/api-schemas";
import { PrismaService } from "../../core/prisma/prisma.service";
import type { BlueprintRow } from "./blueprint.mapper";

const BLUEPRINT_SELECT = {
  id: true,
  orgId: true,
  audience: true,
  name: true,
  definition: true,
  createdAt: true,
} as const;

export interface WorkspaceSnapshotSource {
  phases: { key: string; name: Prisma.JsonValue; type: PhaseType; order: number }[];
  fields: { key: string; label: Prisma.JsonValue; type: FieldType; options: Prisma.JsonValue; required: boolean }[];
}

@Injectable()
export class BlueprintsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    data: { orgId: string; audience: Audience; name: string; definition: Prisma.InputJsonValue },
    tx?: Prisma.TransactionClient,
  ): Promise<BlueprintRow> {
    return (tx ?? this.prisma.client).blueprint.create({ data, select: BLUEPRINT_SELECT });
  }

  // §4: системные (orgId IS NULL) + свои org-private в одном списке, опционально сузить audience.
  list(orgId: string, audience?: Audience): Promise<BlueprintRow[]> {
    return this.prisma.client.blueprint.findMany({
      where: { OR: [{ orgId: null }, { orgId }], ...(audience ? { audience } : {}) },
      select: BLUEPRINT_SELECT,
      orderBy: { createdAt: "asc" },
    });
  }

  // Инстанцирование (§3): видит системный ИЛИ свой org-private. Чужой org-private → null → 404.
  findVisibleById(id: string, orgId: string, tx?: Prisma.TransactionClient): Promise<BlueprintRow | null> {
    return (tx ?? this.prisma.client).blueprint.findFirst({
      where: { id, OR: [{ orgId: null }, { orgId }] },
      select: BLUEPRINT_SELECT,
    });
  }

  // Delete (§6): ТОЛЬКО свой org-private — системный (orgId=null) сюда никогда не попадёт,
  // даже если id угадан правильно (WHERE требует orgId = ctx.orgId буквально, не OR).
  findOwnById(id: string, orgId: string): Promise<BlueprintRow | null> {
    return this.prisma.client.blueprint.findFirst({ where: { id, orgId }, select: BLUEPRINT_SELECT });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.client.blueprint.delete({ where: { id } });
  }

  // Save-as-blueprint (§9 FR-BP-4): снапшот-источник для POST /v1/blueprints. Самодостаточный
  // запрос через PrismaService напрямую (не WorkspacesRepository/FieldsRepository) — избегаем
  // кросс-модульной связи ради одного read-only джойна, тот же приём, что NotificationsRepository.
  findWorkspaceSnapshotSource(workspaceId: string, orgId: string): Promise<WorkspaceSnapshotSource | null> {
    return this.prisma.client.workspace.findFirst({
      where: { id: workspaceId, orgId },
      select: {
        phases: { select: { key: true, name: true, type: true, order: true }, orderBy: { order: "asc" } },
        fields: { select: { key: true, label: true, type: true, options: true, required: true }, orderBy: { id: "asc" } },
      },
    });
  }
}
