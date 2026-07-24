import { Injectable } from "@nestjs/common";
import type { Prisma } from "@helix/db";
import { PrismaService } from "../../core/prisma/prisma.service";

@Injectable()
export class ProjectsRepository {
  constructor(private readonly prisma: PrismaService) {}

  countByPhase(phaseId: string, tx?: Prisma.TransactionClient): Promise<number> {
    return (tx ?? this.prisma.client).project.count({ where: { phaseId } });
  }

  // Перенос проектов между фазами ОДНОГО воркспейса при удалении фазы (§6).
  // workspaceId у проектов не меняется — composite-FK (phaseId, workspaceId) остаётся
  // валидным, т.к. целевая фаза в том же воркспейсе (проверяется в сервисе).
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
}
