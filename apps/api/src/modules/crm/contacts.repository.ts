import { Injectable } from "@nestjs/common";
import type { Prisma } from "@helix/db";
import { PrismaService } from "../../core/prisma/prisma.service";
import {
  CONTACT_INTERNAL_SELECT,
  CONTACT_SELECT,
  type ContactInternalRow,
  type ContactRow,
} from "./contact.mapper";

// Строка из FOR UPDATE-локов (§7.4): нужные для merge поля + mergedIntoId (проверка активности).
export interface LockedContact {
  id: string;
  orgId: string;
  name: string;
  email: string | null;
  phone: string | null;
  companyId: string | null;
  mergedIntoId: string | null;
}

export interface CreateContactData {
  orgId: string;
  name: string;
  email?: string | null;
  emailNormalized: string | null;
  phone?: string | null;
  companyId?: string | null;
}

// email И emailNormalized записываются вместе (§4.3) — одним update, атомарно, без второго пути.
export interface UpdateContactData {
  name?: string;
  email?: string | null;
  emailNormalized?: string | null;
  phone?: string | null;
  companyId?: string | null;
}

@Injectable()
export class ContactsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateContactData, tx?: Prisma.TransactionClient): Promise<ContactRow> {
    return (tx ?? this.prisma.client).contact.create({ data, select: CONTACT_SELECT });
  }

  update(id: string, data: UpdateContactData, tx?: Prisma.TransactionClient): Promise<ContactRow> {
    return (tx ?? this.prisma.client).contact.update({ where: { id }, data, select: CONTACT_SELECT });
  }

  // Свободный контакт удаляется; участник сделки → FK Restrict (§6) → 409 FK_VIOLATION в фильтре.
  async delete(id: string, tx?: Prisma.TransactionClient): Promise<void> {
    await (tx ?? this.prisma.client).contact.delete({ where: { id } });
  }

  // Tenant-scope в WHERE: чужой/несуществующий → null → 404 (IDOR). Возвращает mergedIntoId —
  // единый 410-гейт для смёрженных живёт в сервисе (§7.5).
  findByIdInOrg(
    id: string,
    orgId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ContactInternalRow | null> {
    return (tx ?? this.prisma.client).contact.findFirst({
      where: { id, orgId },
      select: CONTACT_INTERNAL_SELECT,
    });
  }

  // §7.4 анти-дедлок: обе строки ОДНИМ запросом в ORDER BY id — встречный merge (A→B и B→A)
  // встаёт в очередь, а не в клинч. FOR UPDATE держит до commit/rollback транзакции.
  lockPairForMerge(
    ids: [string, string],
    orgId: string,
    tx: Prisma.TransactionClient,
  ): Promise<LockedContact[]> {
    return tx.$queryRaw<LockedContact[]>`
      SELECT "id", "orgId", "name", "email", "phone", "companyId", "mergedIntoId"
      FROM "Contact"
      WHERE "id" IN (${ids[0]}, ${ids[1]}) AND "orgId" = ${orgId}
      ORDER BY "id"
      FOR UPDATE
    `;
  }

  // Soft-погашение source (§7.3): mergedIntoId = target. Физически не удаляем.
  async tombstone(sourceId: string, targetId: string, tx: Prisma.TransactionClient): Promise<void> {
    await tx.contact.update({ where: { id: sourceId }, data: { mergedIntoId: targetId } });
  }

  // §7.3 редирект связей source→target. Дубль (target уже в проекте) → union roles + удалить
  // source-строку; иначе UPDATE contactId (composite-FK держится: target той же орги). Возвращает
  // projectId перенесённых связей (снапшот для un-merge). ProjectContact наполнится в след. срезе,
  // но логика обязана быть корректной уже здесь (§0).
  async redirectProjectContacts(
    sourceId: string,
    targetId: string,
    tx: Prisma.TransactionClient,
  ): Promise<string[]> {
    const links = await tx.projectContact.findMany({ where: { contactId: sourceId } });
    const movedProjectIds: string[] = [];
    for (const link of links) {
      const dup = await tx.projectContact.findUnique({
        where: { projectId_contactId: { projectId: link.projectId, contactId: targetId } },
      });
      if (dup) {
        const roles = Array.from(new Set([...dup.roles, ...link.roles]));
        await tx.projectContact.update({
          where: { projectId_contactId: { projectId: link.projectId, contactId: targetId } },
          data: { roles },
        });
        await tx.projectContact.delete({
          where: { projectId_contactId: { projectId: link.projectId, contactId: sourceId } },
        });
      } else {
        await tx.projectContact.update({
          where: { projectId_contactId: { projectId: link.projectId, contactId: sourceId } },
          data: { contactId: targetId },
        });
      }
      movedProjectIds.push(link.projectId);
    }
    return movedProjectIds;
  }

  // Дедуп-lookup (§4.2): активные контакты орги с тем же emailNormalized. Индекс
  // [orgId, emailNormalized] покрывает. mergedIntoId IS NULL — тумбстоны не кандидаты.
  // companyName денормализуем сразу (§3 DedupHint) — без второго запроса на фронте.
  // Не транзакционно (§4.2 by design). limit 20 — хинт, не полный список.
  findDedupCandidates(
    orgId: string,
    emailNormalized: string,
  ): Promise<Array<{ id: string; name: string; email: string | null; company: { name: string } | null }>> {
    return this.prisma.client.contact.findMany({
      where: { orgId, emailNormalized, mergedIntoId: null },
      select: { id: true, name: true, email: true, company: { select: { name: true } } },
      orderBy: { id: "asc" },
      take: 20,
    });
  }

  // Keyset по id (§2). Смёрженные (тумбстоны) скрыты. q — по name/email (insensitive),
  // companyId — фильтр по компании.
  //
  // projects — джойн под глобальную адресную книгу (список показывает, к каким сделкам привязан
  // контакт): один batched-запрос Prisma на всю страницу, не N+1 по строкам.
  listByOrg(
    orgId: string,
    opts: { q?: string; companyId?: string; cursorId?: string; limit: number },
  ): Promise<Array<ContactRow & { projects: Array<{ project: { id: string; title: string } }> }>> {
    return this.prisma.client.contact.findMany({
      where: {
        orgId,
        mergedIntoId: null,
        ...(opts.companyId ? { companyId: opts.companyId } : {}),
        ...(opts.q
          ? {
              OR: [
                { name: { contains: opts.q, mode: "insensitive" } },
                { email: { contains: opts.q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: { ...CONTACT_SELECT, projects: { select: { project: { select: { id: true, title: true } } } } },
      orderBy: { id: "asc" },
      take: opts.limit + 1,
      ...(opts.cursorId ? { cursor: { id: opts.cursorId }, skip: 1 } : {}),
    });
  }
}
