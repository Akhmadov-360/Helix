import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";

export interface AuditLogRow {
  id: string;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  action: string;
  payload: unknown;
  createdAt: Date;
}

@Injectable()
export class AuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Лента org-уровневого аудита, свежие сверху (@@index([orgId, createdAt])). Cursor — id
   * последней увиденной строки (не offset): офсет-пагинация «плывёт» при вставке новых строк
   * между страницами, а аудит-лог как раз постоянно пишется.
   */
  async list(orgId: string, opts: { cursor?: string; limit: number }): Promise<AuditLogRow[]> {
    const rows = await this.prisma.client.auditLog.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      take: opts.limit,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        actorId: true,
        action: true,
        payload: true,
        createdAt: true,
        actor: { select: { name: true, email: true } },
      },
    });

    return rows.map((r) => ({
      id: r.id,
      actorId: r.actorId,
      actorName: r.actor?.name ?? null,
      actorEmail: r.actor?.email ?? null,
      action: r.action,
      payload: r.payload,
      createdAt: r.createdAt,
    }));
  }
}
