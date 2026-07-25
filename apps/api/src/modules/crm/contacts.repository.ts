import { Injectable } from "@nestjs/common";
import type { Prisma } from "@helix/db";
import { PrismaService } from "../../core/prisma/prisma.service";
import { CONTACT_SELECT, type ContactRow } from "./contact.mapper";

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

  // Tenant-scope в WHERE: чужой/несуществующий → null → 404 (IDOR). mergedIntoId НЕ фильтруем
  // здесь — единый 410-гейт для смёрженных живёт в сервисе (§7.5, единица 7).
  findByIdInOrg(id: string, orgId: string, tx?: Prisma.TransactionClient): Promise<ContactRow | null> {
    return (tx ?? this.prisma.client).contact.findFirst({ where: { id, orgId }, select: CONTACT_SELECT });
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
  listByOrg(
    orgId: string,
    opts: { q?: string; companyId?: string; cursorId?: string; limit: number },
  ): Promise<ContactRow[]> {
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
      select: CONTACT_SELECT,
      orderBy: { id: "asc" },
      take: opts.limit + 1,
      ...(opts.cursorId ? { cursor: { id: opts.cursorId }, skip: 1 } : {}),
    });
  }
}
