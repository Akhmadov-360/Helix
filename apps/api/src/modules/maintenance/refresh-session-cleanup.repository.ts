import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";

@Injectable()
export class RefreshSessionCleanupRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Удаляет строки RefreshSession, мёртвые (revoked/used/expired) дольше `cutoff` (§ retention —
   * держим их некоторое время ПОСЛЕ смерти ради инцидент-анализа по revokedReason=REUSE, не сразу).
   * Живые строки (usedAt/revokedAt IS NULL И expiresAt в будущем) не трогает ни при каком cutoff.
   */
  async deleteStale(cutoff: Date): Promise<number> {
    const { count } = await this.prisma.client.refreshSession.deleteMany({
      where: {
        OR: [{ revokedAt: { lt: cutoff } }, { usedAt: { lt: cutoff } }, { expiresAt: { lt: cutoff } }],
      },
    });
    return count;
  }
}
