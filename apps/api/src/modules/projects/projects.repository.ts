import { Injectable } from "@nestjs/common";
import type { Prisma, ProjectStatus as DbProjectStatus } from "@helix/db";
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

  findByIdInOrg(id: string, orgId: string, tx?: Prisma.TransactionClient): Promise<ProjectRow | null> {
    return (tx ?? this.prisma.client).project.findFirst({ where: { id, orgId }, select: PROJECT_SELECT });
  }

  updatePosition(
    id: string,
    data: { phaseId: string; rank: string; status: ProjectStatus },
    tx?: Prisma.TransactionClient,
  ): Promise<ProjectRow> {
    return (tx ?? this.prisma.client).project.update({ where: { id }, data, select: PROJECT_SELECT });
  }

  async setRank(id: string, rank: string, tx?: Prisma.TransactionClient): Promise<void> {
    await (tx ?? this.prisma.client).project.update({ where: { id }, data: { rank } });
  }

  updateStatus(
    id: string,
    status: ProjectStatus,
    tx?: Prisma.TransactionClient,
  ): Promise<ProjectRow> {
    return (tx ?? this.prisma.client).project.update({ where: { id }, data: { status }, select: PROJECT_SELECT });
  }

  // Все id колонки в порядке (rank, id) — для рекомпакции (§4.4).
  phaseProjectIdsOrdered(
    phaseId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Array<{ id: string }>> {
    return (tx ?? this.prisma.client).project.findMany({
      where: { phaseId },
      orderBy: [{ rank: "asc" }, { id: "asc" }],
      select: { id: true },
    });
  }

  // Advisory xact-lock на фазу (§4.3): namespace 4242 разводит от коллизий hashtext
  // между разными фазами. Освобождается на commit/rollback.
  async lockPhase(phaseId: string, tx: Prisma.TransactionClient): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(4242, hashtext(${phaseId}))`;
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

  // Доска: первые N карточек КАЖДОЙ фазы одним запросом (§8). Цикл по фазам = N+1;
  // один WHERE workspaceId = 10×500 строк. LATERAL с LIMIT на колонку — Prisma не
  // выражает → $queryRaw (4-й выход за ORM: запрос, не DDL). Воркспейс уже проверен
  // на принадлежность орге в сервисе, поэтому фильтр по workspaceId достаточен.
  boardRows(workspaceId: string, limitPerPhase: number): Promise<ProjectRow[]> {
    return this.prisma.client.$queryRaw<ProjectRow[]>`
      SELECT p.* FROM "Phase" ph
      CROSS JOIN LATERAL (
        SELECT * FROM "Project"
        WHERE "phaseId" = ph.id AND "status" <> 'ARCHIVED'
        ORDER BY "rank", "id"
        LIMIT ${limitPerPhase}
      ) p
      WHERE ph."workspaceId" = ${workspaceId}
      ORDER BY ph."order", p."rank", p."id"
    `;
  }

  // Счётчик карточек по фазам — отдельный COUNT (§8: из ограниченной выборки не выводится).
  async columnTotals(workspaceId: string): Promise<Map<string, number>> {
    const rows = await this.prisma.client.$queryRaw<Array<{ phaseId: string; total: number }>>`
      SELECT "phaseId", COUNT(*)::int AS total FROM "Project"
      WHERE "workspaceId" = ${workspaceId} AND "status" <> 'ARCHIVED'
      GROUP BY "phaseId"
    `;
    return new Map(rows.map((r) => [r.phaseId, Number(r.total)]));
  }

  // Keyset-пагинация колонки (§8): (rank, id) > (cursor). Не OFFSET — при неуникальном
  // ранге offset недетерминирован. Курсор null → первая страница.
  columnPage(
    phaseId: string,
    cursorRank: string | null,
    cursorId: string | null,
    limit: number,
  ): Promise<ProjectRow[]> {
    return this.prisma.client.$queryRaw<ProjectRow[]>`
      SELECT * FROM "Project"
      WHERE "phaseId" = ${phaseId} AND "status" <> 'ARCHIVED'
        AND (
          ${cursorRank}::text IS NULL
          OR "rank" > ${cursorRank}
          OR ("rank" = ${cursorRank} AND "id" > ${cursorId})
        )
      ORDER BY "rank", "id"
      LIMIT ${limit}
    `;
  }
}
