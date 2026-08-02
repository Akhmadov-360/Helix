import { Injectable } from "@nestjs/common";
import type { Prisma } from "@helix/db";
import { PrismaService } from "../../core/prisma/prisma.service";
import type { CompanyRow } from "./company.mapper";
import { CONTACT_SELECT, type ContactRow } from "./contact.mapper";

const COMPANY_SELECT = {
  id: true,
  orgId: true,
  name: true,
  domain: true,
  industry: true,
  createdAt: true,
  updatedAt: true,
} as const;

export interface CreateCompanyData {
  orgId: string;
  name: string;
  domain?: string | null;
  domainNormalized: string | null;
  industry?: string | null;
}

export interface UpdateCompanyData {
  name?: string;
  domain?: string | null;
  domainNormalized?: string | null;
  industry?: string | null;
}

@Injectable()
export class CompaniesRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateCompanyData, tx?: Prisma.TransactionClient): Promise<CompanyRow> {
    return (tx ?? this.prisma.client).company.create({ data, select: COMPANY_SELECT });
  }

  update(id: string, data: UpdateCompanyData, tx?: Prisma.TransactionClient): Promise<CompanyRow> {
    return (tx ?? this.prisma.client).company.update({ where: { id }, data, select: COMPANY_SELECT });
  }

  // Каскада на контакты НЕТ: FK Contact.company = SET NULL (companyId) — распустили компанию,
  // люди остались без работодателя (§6, manual-point #5).
  async delete(id: string, tx?: Prisma.TransactionClient): Promise<void> {
    await (tx ?? this.prisma.client).company.delete({ where: { id } });
  }

  // Tenant-scope в WHERE: чужой/несуществующий → null → 404 (§2, защита от IDOR).
  findByIdInOrg(id: string, orgId: string, tx?: Prisma.TransactionClient): Promise<CompanyRow | null> {
    return (tx ?? this.prisma.client).company.findFirst({ where: { id, orgId }, select: COMPANY_SELECT });
  }

  // Карточка компании + её АКТИВНЫЕ контакты (§2). Смёрженные (mergedIntoId != null) —
  // тумбстоны, в списке не показываем (§7.5).
  async findDetailInOrg(
    id: string,
    orgId: string,
  ): Promise<(CompanyRow & { contacts: ContactRow[] }) | null> {
    return this.prisma.client.company.findFirst({
      where: { id, orgId },
      select: {
        ...COMPANY_SELECT,
        contacts: {
          where: { mergedIntoId: null },
          select: CONTACT_SELECT,
          orderBy: { id: "asc" },
        },
      },
    });
  }

  // Дедуп по домену (FR-CC-4) — тот же приём, что Contact.findDedupCandidates (contacts.repository.ts).
  findDedupCandidates(
    orgId: string,
    domainNormalized: string,
  ): Promise<Array<{ id: string; name: string; domain: string | null }>> {
    return this.prisma.client.company.findMany({
      where: { orgId, domainNormalized },
      select: { id: true, name: true, domain: true },
      orderBy: { id: "asc" },
      take: 20,
    });
  }

  // Keyset по id (§2): стабилен, детерминирован при равных именах. take limit+1 → hasMore.
  // q — подстрочный поиск по name (case-insensitive).
  listByOrg(
    orgId: string,
    opts: { q?: string; cursorId?: string; limit: number },
  ): Promise<CompanyRow[]> {
    return this.prisma.client.company.findMany({
      where: {
        orgId,
        ...(opts.q ? { name: { contains: opts.q, mode: "insensitive" } } : {}),
      },
      select: COMPANY_SELECT,
      orderBy: { id: "asc" },
      take: opts.limit + 1,
      ...(opts.cursorId ? { cursor: { id: opts.cursorId }, skip: 1 } : {}),
    });
  }
}
