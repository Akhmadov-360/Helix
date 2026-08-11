import { Injectable } from "@nestjs/common";
import type { Audience as DbAudience, PhaseType as DbPhaseType, Prisma } from "@helix/db";
import type { Audience, PhaseType } from "@helix/api-schemas";
import { PrismaService } from "../../core/prisma/prisma.service";
import { PHASE_SELECT } from "../phases/phases.repository";

// Страж от рассинхрона зеркал enum'ов (api-schemas) с доменом (schema.prisma):
// расходятся наборы значений → ошибка компиляции, а не рантайм-баг у клиента.
type AssignableTo<_A extends B, B> = never;
type _AudienceParity = AssignableTo<DbAudience, Audience> | AssignableTo<Audience, DbAudience>;
type _PhaseTypeParity = AssignableTo<DbPhaseType, PhaseType> | AssignableTo<PhaseType, DbPhaseType>;

const WORKSPACE_SELECT = {
  id: true,
  name: true,
  audience: true,
  settings: true,
  version: true,
  createdAt: true,
  blueprintId: true, // pages-kb.md §3 — ProjectsService.create читает при инстанцировании pageTemplates
} as const;

@Injectable()
export class WorkspacesRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    data: {
      orgId: string;
      name: string;
      audience?: Audience;
      settings?: Prisma.InputJsonValue;
      blueprintId?: string;
    },
    tx?: Prisma.TransactionClient,
  ) {
    return (tx ?? this.prisma.client).workspace.create({ data, select: WORKSPACE_SELECT });
  }

  update(
    id: string,
    data: { name?: string; audience?: Audience; settings?: Prisma.InputJsonValue },
    tx?: Prisma.TransactionClient,
  ) {
    return (tx ?? this.prisma.client).workspace.update({ where: { id }, data, select: WORKSPACE_SELECT });
  }

  // Каскад по FK удалит фазы (Phase.workspace onDelete: Cascade).
  async delete(id: string, tx?: Prisma.TransactionClient): Promise<void> {
    await (tx ?? this.prisma.client).workspace.delete({ where: { id } });
  }

  listByOrg(orgId: string, tx?: Prisma.TransactionClient) {
    return (tx ?? this.prisma.client).workspace.findMany({
      where: { orgId },
      select: { ...WORKSPACE_SELECT, _count: { select: { phases: true } } },
      orderBy: { createdAt: "asc" },
    });
  }

  // version двигается при любом изменении состава/порядка фаз (§4): create/delete/reorder.
  async bumpVersion(id: string, tx?: Prisma.TransactionClient): Promise<void> {
    await (tx ?? this.prisma.client).workspace.update({
      where: { id },
      data: { version: { increment: 1 } },
    });
  }

  // Оптимистическая блокировка (§4): инкремент только если version совпал с ожидаемым.
  // 0 обновлённых строк → доска изменилась под клиентом → 409.
  async bumpVersionIf(
    id: string,
    expectedVersion: number,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const { count } = await (tx ?? this.prisma.client).workspace.updateMany({
      where: { id, version: expectedVersion },
      data: { version: { increment: 1 } },
    });
    return count;
  }

  // Tenant-scope в самом WHERE: чужой/несуществующий id → null → 404 (§8, защита от IDOR).
  findByIdInOrg(id: string, orgId: string, tx?: Prisma.TransactionClient) {
    return (tx ?? this.prisma.client).workspace.findFirst({
      where: { id, orgId },
      select: {
        ...WORKSPACE_SELECT,
        phases: { select: PHASE_SELECT, orderBy: { order: "asc" } },
      },
    });
  }
}
