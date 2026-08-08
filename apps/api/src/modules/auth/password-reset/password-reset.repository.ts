import { Injectable } from "@nestjs/common";
import type { Prisma } from "@helix/db";
import { PrismaService } from "../../../core/prisma/prisma.service";

export interface PasswordResetTokenRow {
  id: string;
  userId: string;
}

@Injectable()
export class PasswordResetRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    data: { userId: string; tokenHash: string; expiresAt: Date },
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await (tx ?? this.prisma.client).passwordResetToken.create({ data });
  }

  /** Живой = не использован и не истёк. Битый/просроченный токен здесь не найдётся. */
  async findValidByTokenHash(
    tokenHash: string,
    tx?: Prisma.TransactionClient,
  ): Promise<PasswordResetTokenRow | null> {
    return (tx ?? this.prisma.client).passwordResetToken.findFirst({
      where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, userId: true },
    });
  }

  /**
   * Атомарный compare-and-set (тот же приём, что RefreshSessionsRepository.markUsed):
   * `usedAt: null` в WHERE защищает от двойного использования при гонке —
   * второй параллельный reset увидит count 0, а не молча тоже сменит пароль.
   */
  async markUsed(id: string, tx?: Prisma.TransactionClient): Promise<number> {
    const { count } = await (tx ?? this.prisma.client).passwordResetToken.updateMany({
      where: { id, usedAt: null },
      data: { usedAt: new Date() },
    });
    return count;
  }
}
