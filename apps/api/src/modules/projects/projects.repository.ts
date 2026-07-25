import { Injectable } from "@nestjs/common";
import type { ProjectStatus as DbProjectStatus, Prisma } from "@helix/db";
import type { ProjectStatus } from "@helix/api-schemas";
import { PrismaService } from "../../core/prisma/prisma.service";
import type { ProjectRow } from "./project.mapper";

// Страж от рассинхрона зеркала ProjectStatus (api-schemas) с доменом (schema.prisma).
type AssignableTo<_A extends B, B> = never;
type _StatusParity = AssignableTo<DbProjectStatus, ProjectStatus> | AssignableTo<ProjectStatus, DbProjectStatus>;

export const PROJECT_SELECT = {
  id: true,
  workspaceId: true,
  phaseId: true,
  title: true,
  status: true,
  value: true,
  currency: true,
  source: true,
  companyId: true,
  ownerId: true,
  rank: true,
  createdAt: true,
  updatedAt: true,
} as const;

export interface CreateProjectData {
  orgId: string;
  workspaceId: string;
  phaseId: string;
  title: string;
  rank: string;
  status: ProjectStatus;
  value?: number;
  currency?: string;
  source?: string;
  companyId?: string;
  ownerId?: string;
}

@Injectable()
export class ProjectsRepository {
  constructor(private readonly prisma: PrismaService) {}

  countByPhase(phaseId: string, tx?: Prisma.TransactionClient): Promise<number> {
    return (tx ?? this.prisma.client).project.count({ where: { phaseId } });
  }

  // Перенос проектов между фазами ОДНОГО воркспейса при удалении фазы (§6, срез фаз).
  async reassignPhase(
    fromPhaseId: string,
    toPhaseId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await (tx ?? this.prisma.client).project.updateMany({
      where: { phaseId: fromPhaseId },
      data: { phaseId: toPhaseId },
    });
  }

  create(data: CreateProjectData, tx?: Prisma.TransactionClient): Promise<ProjectRow> {
    return (tx ?? this.prisma.client).project.create({ data, select: PROJECT_SELECT });
  }

  // Верхний (минимальный) ранг колонки — для вставки нового лида наверх (§3.3).
  async findTopRank(phaseId: string, tx?: Prisma.TransactionClient): Promise<string | null> {
    const top = await (tx ?? this.prisma.client).project.findFirst({
      where: { phaseId },
      orderBy: [{ rank: "asc" }, { id: "asc" }],
      select: { rank: true },
    });
    return top?.rank ?? null;
  }
}
