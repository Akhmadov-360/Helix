import { Injectable } from "@nestjs/common";
import type { Prisma, Role } from "@helix/db";
import { PrismaService } from "../../core/prisma/prisma.service";

export interface CreateInviteData {
  orgId: string;
  email: string;
  role: Role;
  invitedByUserId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface InviteContext {
  id: string;
  orgId: string;
  email: string;
  role: Role;
  orgName: string;
  inviterName: string;
}

export interface PendingInvite {
  id: string;
  email: string;
  role: Role;
  invitedByName: string;
  createdAt: Date;
  expiresAt: Date;
}

const PENDING_WHERE = { acceptedAt: null, revokedAt: null } as const;

@Injectable()
export class InvitesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateInviteData, tx?: Prisma.TransactionClient): Promise<{ id: string }> {
    return (tx ?? this.prisma.client).invite.create({ data, select: { id: true } });
  }

  /**
   * Единая точка чтения по токену — используется и превью (§6 GET), и accept (§3). Возвращает
   * `null` при ЛЮБОЙ причине невалидности (не найден/отозван/принят/истёк) — причина не
   * раскрывается наружу (тот же приём, что findValidByTokenHash у password-reset).
   */
  async findValidByTokenHash(tokenHash: string, tx?: Prisma.TransactionClient): Promise<InviteContext | null> {
    const invite = await (tx ?? this.prisma.client).invite.findFirst({
      where: { tokenHash, ...PENDING_WHERE, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        orgId: true,
        email: true,
        role: true,
        org: { select: { name: true } },
        invitedBy: { select: { name: true } },
      },
    });
    if (!invite) return null;

    return {
      id: invite.id,
      orgId: invite.orgId,
      email: invite.email,
      role: invite.role,
      orgName: invite.org.name,
      inviterName: invite.invitedBy.name,
    };
  }

  /**
   * Compare-and-set: race-guard против конкурентного двойного accept одного токена (тот же
   * приём, что PasswordResetRepository.markUsed / RefreshSessionsRepository.markUsed).
   * @returns 1 — этот вызов захватил инвайт; 0 — уже принят/отозван кем-то ещё.
   */
  async markAccepted(id: string, acceptedByUserId: string, tx?: Prisma.TransactionClient): Promise<number> {
    const { count } = await (tx ?? this.prisma.client).invite.updateMany({
      where: { id, ...PENDING_WHERE },
      data: { acceptedAt: new Date(), acceptedByUserId },
    });
    return count;
  }

  /** Идемпотентно: повторный revoke не перетирает исходное acceptedAt/revokedAt. */
  async markRevoked(id: string, tx?: Prisma.TransactionClient): Promise<number> {
    const { count } = await (tx ?? this.prisma.client).invite.updateMany({
      where: { id, ...PENDING_WHERE },
      data: { revokedAt: new Date() },
    });
    return count;
  }

  /** invites.md §1: resend = revoke текущего pending (если есть) + create нового, одной транзакцией. */
  async findPendingByEmail(
    orgId: string,
    email: string,
    tx?: Prisma.TransactionClient,
  ): Promise<{ id: string } | null> {
    return (tx ?? this.prisma.client).invite.findFirst({
      where: { orgId, email, ...PENDING_WHERE, expiresAt: { gt: new Date() } },
      select: { id: true },
    });
  }

  /** Список под UI «Pending invites» (§6 GET) — только actionable-строки, не вся история. */
  async listPending(orgId: string): Promise<PendingInvite[]> {
    const invites = await this.prisma.client.invite.findMany({
      where: { orgId, ...PENDING_WHERE, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        expiresAt: true,
        invitedBy: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return invites.map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role,
      invitedByName: i.invitedBy.name,
      createdAt: i.createdAt,
      expiresAt: i.expiresAt,
    }));
  }

  /** Тенант-скоуп для DELETE :id (§6) — чужой id из другой орги не должен быть виден/отзываем. */
  async findPendingInOrg(orgId: string, id: string): Promise<{ id: string; email: string; role: Role } | null> {
    return this.prisma.client.invite.findFirst({
      where: { id, orgId, ...PENDING_WHERE },
      select: { id: true, email: true, role: true },
    });
  }
}
