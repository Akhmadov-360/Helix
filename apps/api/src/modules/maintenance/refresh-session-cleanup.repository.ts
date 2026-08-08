import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { REFRESH_SESSION_CLEANUP_BATCH_SIZE } from "./refresh-session-cleanup-job";

@Injectable()
export class RefreshSessionCleanupRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Удаляет строки RefreshSession, мёртвые (revoked/used/expired) дольше `cutoff`. Живые строки
   * (usedAt/revokedAt IS NULL И expiresAt в будущем) не трогает ни при каком cutoff.
   *
   * Батчами по BATCH_SIZE, не одним deleteMany: предикат матчит бОльшую часть таблицы по
   * конструкции (это нормальное состояние, не аномалия), поэтому на масштабе один deleteMany —
   * одна транзакция на сотни тысяч строк, держащая локи и генерящая burst WAL. Батчинг —
   * измеренное решение (EXPLAIN на 500k строк, refresh-session-cleanup-job.ts), НЕ добавление
   * индекса: индекс здесь не помогает (planner его игнорирует при такой селективности).
   */
  async deleteStale(cutoff: Date): Promise<number> {
    const where = {
      OR: [{ revokedAt: { lt: cutoff } }, { usedAt: { lt: cutoff } }, { expiresAt: { lt: cutoff } }],
    };

    let totalDeleted = 0;
    for (;;) {
      const batch = await this.prisma.client.refreshSession.findMany({
        where,
        select: { id: true },
        take: REFRESH_SESSION_CLEANUP_BATCH_SIZE,
      });
      if (batch.length === 0) break;

      const { count } = await this.prisma.client.refreshSession.deleteMany({
        where: { id: { in: batch.map((row) => row.id) } },
      });
      totalDeleted += count;

      if (batch.length < REFRESH_SESSION_CLEANUP_BATCH_SIZE) break;
    }
    return totalDeleted;
  }
}
