import { Injectable } from "@nestjs/common";
import type { Prisma } from "@helix/db";
import { PrismaService } from "../../core/prisma/prisma.service";
import type { FieldDefinitionRow } from "./field.mapper";

export const FIELD_SELECT = {
  id: true,
  workspaceId: true,
  key: true,
  label: true,
  type: true,
  options: true,
  required: true,
} as const;

@Injectable()
export class FieldsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    data: Prisma.FieldDefinitionUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<FieldDefinitionRow> {
    return (tx ?? this.prisma.client).fieldDefinition.create({ data, select: FIELD_SELECT });
  }

  // blueprints.md §3: инстанцирование projectFields[] — коллизия key внутри одного блюпринта
  // (@@unique([workspaceId, key])) бросает и откатывает всю транзакцию воркспейса (атомарность).
  createMany(data: Prisma.FieldDefinitionCreateManyInput[], tx?: Prisma.TransactionClient): Promise<unknown> {
    return (tx ?? this.prisma.client).fieldDefinition.createMany({ data });
  }

  // Tenant-scope через связь: field → workspace.orgId. Чужой/несуществующий id → null → 404.
  findByIdInOrg(
    id: string,
    orgId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<FieldDefinitionRow | null> {
    return (tx ?? this.prisma.client).fieldDefinition.findFirst({
      where: { id, workspace: { orgId } },
      select: FIELD_SELECT,
    });
  }

  update(
    id: string,
    data: Prisma.FieldDefinitionUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<FieldDefinitionRow> {
    return (tx ?? this.prisma.client).fieldDefinition.update({
      where: { id },
      data,
      select: FIELD_SELECT,
    });
  }

  async delete(id: string, tx?: Prisma.TransactionClient): Promise<void> {
    await (tx ?? this.prisma.client).fieldDefinition.delete({ where: { id } });
  }

  // §3: без order-колонки — порядок создания (id — cuid, монотонно возрастающий).
  listByWorkspaceOrdered(
    workspaceId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<FieldDefinitionRow[]> {
    return (tx ?? this.prisma.client).fieldDefinition.findMany({
      where: { workspaceId },
      orderBy: { id: "asc" },
      select: FIELD_SELECT,
    });
  }
}
