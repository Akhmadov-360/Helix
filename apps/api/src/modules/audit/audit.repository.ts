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
   * Лента org-уровневого аудита, свежие сверху (@@index([orgId, createdAt]), @@index([orgId,
   * action, createdAt]) под фильтр). Cursor — id последней увиденной строки (не offset):
   * офсет-пагинация «плывёт» при вставке новых строк между страницами, а аудит-лог как раз
   * постоянно пишется. take: limit+1 — та же техника, что companies.repository.ts: последняя
   * лишняя строка не отдаётся, а превращается в hasMore.
   */
  async list(orgId: string, opts: { cursor?: string; limit: number; action?: string }): Promise<{ rows: AuditLogRow[]; hasMore: boolean }> {
    const rows = await this.prisma.client.auditLog.findMany({
      where: { orgId, ...(opts.action ? { action: opts.action } : {}) },
      orderBy: { createdAt: "desc" },
      take: opts.limit + 1,
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

    const hasMore = rows.length > opts.limit;
    return {
      hasMore,
      rows: rows.slice(0, opts.limit).map((r) => ({
        id: r.id,
        actorId: r.actorId,
        actorName: r.actor?.name ?? null,
        actorEmail: r.actor?.email ?? null,
        action: r.action,
        payload: r.payload,
        createdAt: r.createdAt,
      })),
    };
  }
}
