import { Injectable } from "@nestjs/common";
import type { Prisma, Role } from "@helix/db";
import { PrismaService } from "../../core/prisma/prisma.service";

export interface OrganizationRef {
  id: string;
  name: string;
}

/**
 * Membership живёт здесь, а не в отдельном репозитории: это список участников
 * организации — та же агрегатная граница и всегда та же транзакция. Заводить
 * репозиторий на одну таблицу-связку значило бы плодить слои без потребителя.
 */
@Injectable()
export class OrganizationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: { name: string }, tx?: Prisma.TransactionClient): Promise<OrganizationRef> {
    return (tx ?? this.prisma.client).organization.create({
      data,
      select: { id: true, name: true },
    });
  }

  /** invites.md §9: имя орги для письма-приглашения. */
  async findById(orgId: string): Promise<OrganizationRef | null> {
    return this.prisma.client.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true },
    });
  }

  /** FR-ORG-3: текущие org-level settings (JSON, default "{}") + name для ответа контроллера. */
  async findSettings(orgId: string): Promise<{ name: string; settings: Prisma.JsonValue } | null> {
    return this.prisma.client.organization.findUnique({
      where: { id: orgId },
      select: { name: true, settings: true },
    });
  }

  /**
   * Замена всей settings-колонки + опционально name (отдельная колонка, не часть JSON).
   * Партиальный merge (старое + новое) считается в service — репозиторий получает уже готовый
   * финальный объект, а не занимается JSON-логикой. name: undefined → Prisma пропускает поле,
   * не трогает существующее значение (обычная PATCH-семантика).
   */
  async updateSettings(
    orgId: string,
    data: { name?: string; settings: Prisma.InputJsonValue },
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await (tx ?? this.prisma.client).organization.update({
      where: { id: orgId },
      data,
    });
  }

  async addMember(
    data: { orgId: string; userId: string; role: Role },
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await (tx ?? this.prisma.client).membership.create({ data });
  }

  /**
   * Роль пользователя в организации — ЕДИНСТВЕННЫЙ источник истины по правам.
   *
   * Читается на каждом запросе (§6), а не кладётся в токен: роль меняется независимо
   * от токена, и запечённая в 15-минутный JWT она давала бы stale authorization
   * (понизили OWNER→MEMBER, а он ещё 15 минут OWNER). Тот же per-request read ловит
   * исключение из орги мгновенно.
   *
   * null = членства нет.
   */
  async findMembershipRole(
    userId: string,
    orgId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Role | null> {
    const membership = await (tx ?? this.prisma.client).membership.findUnique({
      where: { orgId_userId: { orgId, userId } },
      select: { role: true },
    });

    return membership?.role ?? null;
  }

  /**
   * Орга, в которую логиним по умолчанию.
   *
   * ВРЕМЕННОЕ ПРАВИЛО: «самая старая орга пользователя» = личная, созданная при
   * регистрации. В схеме нет признака «личная», а §9.1 говорит «иначе личная орга» —
   * пока юзер состоит ровно в одной орге (инвариант регистрации), правило точное.
   * На шаге 5 приоритет получит `RefreshSession.lastActiveOrgId`; с приглашениями
   * (позже) понадобится либо явный флаг в схеме, либо «последняя активная».
   *
   * null означал бы User без Membership — состояние, которого по §9.1 не бывает.
   */
  /** Ростер орги под UI-пикеры (assignee/co-worker/reassign) — денормализованный name/email/role. */
  async listMembers(
    orgId: string,
  ): Promise<{ userId: string; name: string; email: string; role: Role }[]> {
    const memberships = await this.prisma.client.membership.findMany({
      where: { orgId },
      select: { role: true, user: { select: { id: true, name: true, email: true } } },
      orderBy: { user: { name: "asc" } },
    });
    return memberships.map((m) => ({ userId: m.user.id, name: m.user.name, email: m.user.email, role: m.role }));
  }

  /**
   * Ростер + workload-агрегаты под Settings > Members. Три параллельных запроса вместо N+1:
   * memberships + groupBy Project.ownerId + groupBy Task.assigneeId. Prisma `_count` внутри
   * `include` не подошёл бы — нужен where-фильтр по статусу/completedAt на related-записях,
   * а он на _count не поддерживается. groupBy — один запрос на всю оргу, склейка в Map.
   */
  async listMembersWithStats(orgId: string): Promise<
    {
      userId: string;
      name: string;
      email: string;
      role: Role;
      assignedLeadsCount: number;
      openTasksCount: number;
    }[]
  > {
    const [memberships, leadCounts, taskCounts] = await Promise.all([
      this.prisma.client.membership.findMany({
        where: { orgId },
        select: { role: true, user: { select: { id: true, name: true, email: true } } },
        orderBy: { user: { name: "asc" } },
      }),
      // OPEN — единственный "живой" статус (WON/LOST — история, ARCHIVED — вообще без фазы).
      // orgId в where не только для безопасности, но и для точного использования индекса
      // (Project.orgId индексирован для tenant-фильтрации). `_count: { _all: true }` — Prisma-way
      // получить число строк в группе, доступное через row._count._all (просто `_count: true`
      // у groupBy типизируется как object, не работает).
      this.prisma.client.project.groupBy({
        by: ["ownerId"],
        where: { orgId, status: "OPEN" },
        _count: { _all: true },
      }),
      this.prisma.client.task.groupBy({
        by: ["assigneeId"],
        where: { orgId, done: false },
        _count: { _all: true },
      }),
    ]);

    const leadsByUser = new Map<string, number>();
    for (const row of leadCounts) if (row.ownerId) leadsByUser.set(row.ownerId, row._count._all);
    const tasksByUser = new Map<string, number>();
    for (const row of taskCounts) if (row.assigneeId) tasksByUser.set(row.assigneeId, row._count._all);

    return memberships.map((m) => ({
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
      assignedLeadsCount: leadsByUser.get(m.user.id) ?? 0,
      openTasksCount: tasksByUser.get(m.user.id) ?? 0,
    }));
  }

  // FR-ORG-2: список орг пользователя под org-switcher — та же таблица (Membership), другой срез
  // (по userId, не orgId), поэтому здесь же, не отдельным репозиторием (см. комментарий класса).
  async listOrgsForUser(userId: string): Promise<{ orgId: string; name: string; role: Role }[]> {
    const memberships = await this.prisma.client.membership.findMany({
      where: { userId },
      select: { role: true, org: { select: { id: true, name: true } } },
      orderBy: { org: { name: "asc" } },
    });
    return memberships.map((m) => ({ orgId: m.org.id, name: m.org.name, role: m.role }));
  }

  async findDefaultOrgIdForUser(
    userId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<string | null> {
    const membership = await (tx ?? this.prisma.client).membership.findFirst({
      where: { userId },
      orderBy: { org: { createdAt: "asc" } },
      select: { orgId: true },
    });

    return membership?.orgId ?? null;
  }

  /** name/email включены для AuditLog-снапшота (P2) — не только role. */
  async findMembership(
    orgId: string,
    userId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<{ role: Role; userName: string; userEmail: string } | null> {
    const membership = await (tx ?? this.prisma.client).membership.findUnique({
      where: { orgId_userId: { orgId, userId } },
      select: { role: true, user: { select: { name: true, email: true } } },
    });
    if (!membership) return null;
    return { role: membership.role, userName: membership.user.name, userEmail: membership.user.email };
  }

  /** Сколько OWNER в орге — guard против «понизили/удалили последнего». */
  async countOwners(orgId: string, tx?: Prisma.TransactionClient): Promise<number> {
    return (tx ?? this.prisma.client).membership.count({ where: { orgId, role: "OWNER" } });
  }

  /** В скольких оргах состоит юзер — guard против «удалили единственное членство». */
  async countOrgsForUser(userId: string, tx?: Prisma.TransactionClient): Promise<number> {
    return (tx ?? this.prisma.client).membership.count({ where: { userId } });
  }

  async updateMemberRole(
    orgId: string,
    userId: string,
    role: Role,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await (tx ?? this.prisma.client).membership.update({
      where: { orgId_userId: { orgId, userId } },
      data: { role },
    });
  }

  async removeMember(orgId: string, userId: string, tx?: Prisma.TransactionClient): Promise<void> {
    await (tx ?? this.prisma.client).membership.delete({
      where: { orgId_userId: { orgId, userId } },
    });
  }
}
