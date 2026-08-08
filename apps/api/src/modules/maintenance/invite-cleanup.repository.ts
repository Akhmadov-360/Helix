import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";

@Injectable()
export class InviteCleanupRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Удаляет строки Invite, мёртвые (accepted/revoked/expired) дольше `cutoff` (invites.md §11 —
   * держим их некоторое время ПОСЛЕ смерти: FK invitedByUserId/acceptedByUserId остаются
   * разрешимыми в течение окна, AuditLog — только текстовый снапшот, не замена). Живые строки
   * (acceptedAt/revokedAt IS NULL И expiresAt в будущем) не трогает ни при каком cutoff.
   */
  async deleteStale(cutoff: Date): Promise<number> {
    const { count } = await this.prisma.client.invite.deleteMany({
      where: {
        OR: [{ acceptedAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }, { expiresAt: { lt: cutoff } }],
      },
    });
    return count;
  }
}
