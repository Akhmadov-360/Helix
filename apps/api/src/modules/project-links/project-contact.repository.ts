import { Injectable } from "@nestjs/common";
import type { DealRole as DbDealRole, Prisma } from "@helix/db";
import type { DealRole } from "@helix/api-schemas";
import { PrismaService } from "../../core/prisma/prisma.service";

// Страж от рассинхрона зеркала DealRole (api-schemas) с доменом (schema.prisma).
type AssignableTo<_A extends B, B> = never;
type _DealRoleParity = AssignableTo<DbDealRole, DealRole> | AssignableTo<DealRole, DbDealRole>;

// Строка связи + денорм контакта для ответа (§3): без второго запроса на фронте.
export interface ProjectContactRow {
  contactId: string;
  roles: DealRole[];
  contact: { name: string; email: string | null; company: { name: string } | null };
}

const LINK_SELECT = {
  contactId: true,
  roles: true,
  contact: { select: { name: true, email: true, company: { select: { name: true } } } },
} as const;

@Injectable()
export class ProjectContactRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Все контакты сделки + роли, стабильный порядок по contactId (§2).
  listByProject(projectId: string, tx?: Prisma.TransactionClient): Promise<ProjectContactRow[]> {
    return (tx ?? this.prisma.client).projectContact.findMany({
      where: { projectId },
      select: LINK_SELECT,
      orderBy: { contactId: "asc" },
    });
  }

  findLink(
    projectId: string,
    contactId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<{ contactId: string } | null> {
    return (tx ?? this.prisma.client).projectContact.findUnique({
      where: { projectId_contactId: { projectId, contactId } },
      select: { contactId: true },
    });
  }

  create(
    data: { projectId: string; contactId: string; orgId: string; roles: DealRole[] },
    tx?: Prisma.TransactionClient,
  ): Promise<ProjectContactRow> {
    return (tx ?? this.prisma.client).projectContact.create({
      data: { ...data, roles: data.roles as DbDealRole[] },
      select: LINK_SELECT,
    });
  }

  updateRoles(
    projectId: string,
    contactId: string,
    roles: DealRole[],
    tx?: Prisma.TransactionClient,
  ): Promise<ProjectContactRow> {
    return (tx ?? this.prisma.client).projectContact.update({
      where: { projectId_contactId: { projectId, contactId } },
      data: { roles: roles as DbDealRole[] },
      select: LINK_SELECT,
    });
  }

  async delete(projectId: string, contactId: string, tx?: Prisma.TransactionClient): Promise<void> {
    await (tx ?? this.prisma.client).projectContact.delete({
      where: { projectId_contactId: { projectId, contactId } },
    });
  }
}
