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

  // PATCH: только редактируемые поля (не phaseId/rank/status — move/archive; не ownerId — reassign).
  updateFields(
    id: string,
    data: {
      title?: string;
      value?: number;
      currency?: string;
      source?: string;
      companyId?: string | null;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<ProjectRow> {
    return (tx ?? this.prisma.client).project.update({ where: { id }, data, select: PROJECT_SELECT });
  }

  // Reassign (§ матрица «Reassign leads»): смена владельца — отдельная операция, не поле PATCH.
  // null = снять владельца.
  reassignOwner(
    id: string,
    ownerId: string | null,
    tx?: Prisma.TransactionClient,
  ): Promise<ProjectRow> {
    return (tx ?? this.prisma.client).project.update({
      where: { id },
      data: { ownerId },
      select: PROJECT_SELECT,
    });
  }

  async delete(id: string, tx?: Prisma.TransactionClient): Promise<void> {
    // Каскад: Task, ActivityEvent (onDelete: Cascade со стороны Project).
    await (tx ?? this.prisma.client).project.delete({ where: { id } });
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

  // Task-чеклист по карточке доски (redesign): batched по projectIds ОДНИМ запросом, не N+1 на
  // карточку. done/total считаем в JS — объёмы малы (десятки тасков на страницу доски, §@@index
  // [projectId, done] на Task всё равно не даёт GROUP BY дешевле для такого масштаба).
  async taskCountsByProjectIds(
    projectIds: string[],
  ): Promise<Map<string, { done: number; total: number }>> {
    if (projectIds.length === 0) return new Map();
    const rows = await this.prisma.client.task.findMany({
      where: { projectId: { in: projectIds } },
      select: { projectId: true, done: true },
    });
    const counts = new Map<string, { done: number; total: number }>();
    for (const row of rows) {
      const entry = counts.get(row.projectId) ?? { done: 0, total: 0 };
      entry.total += 1;
      if (row.done) entry.done += 1;
      counts.set(row.projectId, entry);
    }
    return counts;
  }

  // Co-workers по карточке доски (redesign): та же batched-логика, что у task-счётчика.
  async assigneesByProjectIds(
    projectIds: string[],
  ): Promise<Map<string, Array<{ userId: string; name: string }>>> {
    if (projectIds.length === 0) return new Map();
    const rows = await this.prisma.client.projectAssignee.findMany({
      where: { projectId: { in: projectIds } },
      select: { projectId: true, userId: true, user: { select: { name: true } } },
      orderBy: { userId: "asc" },
    });
    const byProject = new Map<string, Array<{ userId: string; name: string }>>();
    for (const row of rows) {
      const list = byProject.get(row.projectId) ?? [];
      list.push({ userId: row.userId, name: row.user.name });
      byProject.set(row.projectId, list);
    }
    return byProject;
  }

  // Контакты сделки на карточке/в таблице доски (design review) — та же batched-логика, что у
  // assigneesByProjectIds, но по ProjectContact→Contact (не ProjectAssignee→User): это ВНЕШНИЕ
  // люди сделки, не co-workers. Смёрженные (mergedIntoId != null) исключены — тот же фильтр,
  // что у company.contacts/contacts.list (§7.5, тумбстоны не показываем).
  async contactsByProjectIds(
    projectIds: string[],
  ): Promise<Map<string, Array<{ id: string; name: string }>>> {
    if (projectIds.length === 0) return new Map();
    const rows = await this.prisma.client.projectContact.findMany({
      where: { projectId: { in: projectIds }, contact: { mergedIntoId: null } },
      select: { projectId: true, contact: { select: { id: true, name: true } } },
      orderBy: { contactId: "asc" },
    });
    const byProject = new Map<string, Array<{ id: string; name: string }>>();
    for (const row of rows) {
      const list = byProject.get(row.projectId) ?? [];
      list.push({ id: row.contact.id, name: row.contact.name });
      byProject.set(row.projectId, list);
    }
    return byProject;
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
