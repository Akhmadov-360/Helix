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
} as const;

@Injectable()
export class WorkspacesRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    data: { orgId: string; name: string; audience?: Audience; settings?: Prisma.InputJsonValue },
    tx?: Prisma.TransactionClient,
  ) {
    return (tx ?? this.prisma.client).workspace.create({ data, select: WORKSPACE_SELECT });
  }

  listByOrg(orgId: string, tx?: Prisma.TransactionClient) {
    return (tx ?? this.prisma.client).workspace.findMany({
      where: { orgId },
      select: { ...WORKSPACE_SELECT, _count: { select: { phases: true } } },
      orderBy: { createdAt: "asc" },
    });
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
