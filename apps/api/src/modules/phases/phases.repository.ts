import { Injectable } from "@nestjs/common";
import type { Prisma } from "@helix/db";
import { PrismaService } from "../../core/prisma/prisma.service";
import type { PhaseRow } from "./phase.mapper";

export const PHASE_SELECT = {
  id: true,
  workspaceId: true,
  key: true,
  name: true,
  type: true,
  order: true,
  color: true,
} as const;

@Injectable()
export class PhasesRepository {
  constructor(private readonly prisma: PrismaService) {}

  createMany(data: Prisma.PhaseCreateManyInput[], tx?: Prisma.TransactionClient): Promise<unknown> {
    return (tx ?? this.prisma.client).phase.createMany({ data });
  }

  create(data: Prisma.PhaseUncheckedCreateInput, tx?: Prisma.TransactionClient): Promise<PhaseRow> {
    return (tx ?? this.prisma.client).phase.create({ data, select: PHASE_SELECT });
  }

  // Tenant-scope через связь: phase → workspace.orgId. Чужой/несуществующий id → null → 404.
  findByIdInOrg(
    id: string,
    orgId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<PhaseRow | null> {
    return (tx ?? this.prisma.client).phase.findFirst({
      where: { id, workspace: { orgId } },
      select: PHASE_SELECT,
    });
  }

  update(
    id: string,
    data: Prisma.PhaseUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<PhaseRow> {
    return (tx ?? this.prisma.client).phase.update({ where: { id }, data, select: PHASE_SELECT });
  }

  // Только order — для перенумерации при reorder. Промежуточные дубли order внутри
  // транзакции допустимы (constraint DEFERRABLE, проверяется на COMMIT).
  async setOrder(id: string, order: number, tx?: Prisma.TransactionClient): Promise<void> {
    await (tx ?? this.prisma.client).phase.update({ where: { id }, data: { order } });
  }
}
