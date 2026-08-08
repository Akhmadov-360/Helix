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
   * Замена всей settings-колонки. Партиальный merge (старое + новое) считается в service —
   * репозиторий получает уже готовый финальный объект, а не занимается JSON-логикой.
   */
  async updateSettings(
    orgId: string,
    settings: Prisma.InputJsonValue,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await (tx ?? this.prisma.client).organization.update({
      where: { id: orgId },
      data: { settings },
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
