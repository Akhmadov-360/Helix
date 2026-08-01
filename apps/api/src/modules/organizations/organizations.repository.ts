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
}
