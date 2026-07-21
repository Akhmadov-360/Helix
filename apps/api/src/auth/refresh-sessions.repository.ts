import { Injectable } from "@nestjs/common";
import type { Prisma, RefreshRevocationReason, RefreshSession } from "@helix/db";
import { PrismaService } from "../core/prisma/prisma.service";

export interface CreateRefreshSessionData {
  userId: string;
  tokenHash: string;
  familyId: string;
  /** Nullable в схеме: сессия может пережить оргу, для которой была активна. */
  lastActiveOrgId: string | null;
  expiresAt: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class RefreshSessionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Принимает транзакцию: при регистрации сессия создаётся в той же tx, что
   * User + Org + Membership (§9.1 — факты-состояния атомарны).
   */
  async create(
    data: CreateRefreshSessionData,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await (tx ?? this.prisma.client).refreshSession.create({ data });
  }

  /** Лукап по хешу. `tokenHash` UNIQUE — «один токен = одна строка» гарантирует БД. */
  async findByTokenHash(
    tokenHash: string,
    tx?: Prisma.TransactionClient,
  ): Promise<RefreshSession | null> {
    return (tx ?? this.prisma.client).refreshSession.findUnique({ where: { tokenHash } });
  }

  /**
   * Помечает токен потраченным — АТОМАРНЫМ compare-and-set, а не «прочитать и записать».
   *
   * Условие `usedAt: null` в WHERE — это и есть защита от гонки: при двух параллельных
   * refresh с одним токеном второй UPDATE дождётся коммита первого, увидит уже
   * проставленный usedAt и обновит НОЛЬ строк. Возвращаемый count говорит, кто выиграл.
   * Обычный SELECT-then-UPDATE здесь пропустил бы обоих.
   *
   * @returns 1 — токен захвачен этим вызовом; 0 — уже потрачен/отозван кем-то ещё.
   */
  async markUsed(id: string, tx?: Prisma.TransactionClient): Promise<number> {
    const now = new Date();
    const { count } = await (tx ?? this.prisma.client).refreshSession.updateMany({
      where: { id, usedAt: null, revokedAt: null },
      data: { usedAt: now, lastUsedAt: now },
    });
    return count;
  }

  /** Запоминает активную оргу, чтобы следующий refresh вернул юзера туда же (§9.1). */
  async updateLastActiveOrg(
    id: string,
    orgId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await (tx ?? this.prisma.client).refreshSession.update({
      where: { id },
      data: { lastActiveOrgId: orgId },
    });
  }

  /**
   * Отзыв одной сессии (logout). Условие `revokedAt: null` делает операцию
   * идемпотентной: повторный вызов не перетирает исходную причину и время отзыва.
   */
  async revoke(
    id: string,
    reason: RefreshRevocationReason,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const { count } = await (tx ?? this.prisma.client).refreshSession.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    return count;
  }

  /**
   * Отзыв ВСЕХ сессий пользователя — все цепочки, все устройства (§7, logout-all).
   * Захватывает и уже потраченные строки: они и так мертвы по `usedAt`, но так
   * в журнале не остаётся записей «не отозвана» после явного «выйти везде».
   *
   * @returns сколько строк отозвано.
   */
  async revokeAllForUser(
    userId: string,
    reason: RefreshRevocationReason,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const { count } = await (tx ?? this.prisma.client).refreshSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    return count;
  }

  /**
   * Kill family (§5): отзывает ВСЕ живые строки цепочки. Применяется при reuse —
   * отличить вора от настоящего юзера нельзя, поэтому цепочка умирает целиком.
   */
  async revokeFamily(
    familyId: string,
    reason: RefreshRevocationReason,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const { count } = await (tx ?? this.prisma.client).refreshSession.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    return count;
  }
}
