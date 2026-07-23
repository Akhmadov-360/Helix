import { Injectable } from "@nestjs/common";
import type { Prisma } from "@helix/db";
import { PrismaService } from "../../core/prisma/prisma.service";

/** Поля фазы, безопасные для отдачи наружу (маппятся в PhaseResponse). */
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
}
