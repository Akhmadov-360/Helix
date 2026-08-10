import { Injectable } from "@nestjs/common";
import type { Prisma } from "@helix/db";
import { PrismaService } from "../../core/prisma/prisma.service";

export interface AttachmentRow {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  scanStatus: "SKIPPED" | "CLEAN" | "INFECTED";
  confirmedAt: Date | null;
  createdAt: Date;
  uploadedBy: { name: string } | null;
}

const ATTACHMENT_SELECT = {
  id: true,
  filename: true,
  mimeType: true,
  sizeBytes: true,
  storageKey: true,
  scanStatus: true,
  confirmedAt: true,
  createdAt: true,
  uploadedBy: { select: { name: true } },
} satisfies Prisma.AttachmentSelect;

@Injectable()
export class AttachmentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** files.md §3, шаг 1 — строка создаётся сразу, confirmedAt: null (пересмотрено после критики). */
  create(data: {
    id: string;
    orgId: string;
    projectId: string;
    storageKey: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    uploadedById: string | null;
  }): Promise<AttachmentRow> {
    return this.prisma.client.attachment.create({ data, select: ATTACHMENT_SELECT });
  }

  findById(id: string, orgId: string, projectId: string): Promise<AttachmentRow | null> {
    return this.prisma.client.attachment.findFirst({
      where: { id, orgId, projectId },
      select: ATTACHMENT_SELECT,
    });
  }

  /**
   * Compare-and-set (files.md §3) — тот же паттерн, что markUsed/markAccepted: WHERE confirmedAt
   * IS NULL защищает от гонки и делает повторный confirm безопасным (count=0, не ошибка).
   */
  async confirm(id: string): Promise<number> {
    const { count } = await this.prisma.client.attachment.updateMany({
      where: { id, confirmedAt: null },
      data: { confirmedAt: new Date() },
    });
    return count;
  }

  /** §3 — список показывает только подтверждённые (не pending/брошенные). */
  listByProject(projectId: string, orgId: string): Promise<AttachmentRow[]> {
    return this.prisma.client.attachment.findMany({
      where: { projectId, orgId, confirmedAt: { not: null } },
      select: ATTACHMENT_SELECT,
      orderBy: { createdAt: "desc" },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.client.attachment.delete({ where: { id } });
  }

  /** §6 — storage keys дочерних вложений ДО каскадного удаления Project (внутри той же tx). */
  async listStorageKeysByProject(projectId: string, tx?: Prisma.TransactionClient): Promise<string[]> {
    const rows = await (tx ?? this.prisma.client).attachment.findMany({
      where: { projectId },
      select: { storageKey: true },
    });
    return rows.map((r) => r.storageKey);
  }

  /** §6.1 — неподтверждённые загрузки старше cutoff (мёртвые "начатые, не завершённые" строки). */
  findStaleUnconfirmed(cutoff: Date): Promise<{ id: string; storageKey: string }[]> {
    return this.prisma.client.attachment.findMany({
      where: { confirmedAt: null, createdAt: { lt: cutoff } },
      select: { id: true, storageKey: true },
    });
  }

  async deleteMany(ids: string[]): Promise<number> {
    const { count } = await this.prisma.client.attachment.deleteMany({ where: { id: { in: ids } } });
    return count;
  }
}
