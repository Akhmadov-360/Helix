import { Injectable } from "@nestjs/common";
import { Role } from "@helix/db";
import type {
  AuditLogListResponse,
  AuditLogQuery,
  MyOrgListResponse,
  MyOrgResponse,
  OrgMemberListResponse,
} from "@helix/api-schemas";
import {
  LastOwnerError,
  ResourceNotFoundError,
  SoleOrganizationMembershipError,
} from "../../core/errors/domain-error";
import { PrismaService } from "../../core/prisma/prisma.service";
import { AuditRecorder } from "../audit/audit.recorder";
import { AuditRepository } from "../audit/audit.repository";
import { OrganizationsRepository } from "./organizations.repository";

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orgs: OrganizationsRepository,
    private readonly audit: AuditRecorder,
    private readonly auditLog: AuditRepository,
  ) {}

  listMembers(orgId: string): Promise<OrgMemberListResponse> {
    return this.orgs.listMembers(orgId);
  }

  listMine(userId: string): Promise<MyOrgListResponse> {
    return this.orgs.listOrgsForUser(userId);
  }

  /**
   * FR-ORG-2: дополнительная организация для уже существующего юзера — та же
   * последовательность, что регистрация (Org + Membership(OWNER)), но без User
   * (он уже есть) и без выдачи токенов (переключается через switch-org, как обычно).
   *
   * Аудит пишется в НОВУЮ оргу (orgId = только что созданная) — это первая строка её
   * собственного журнала: «кем и когда создана» (decisions.md D5, P4: атомарно с созданием).
   */
  async create(userId: string, name: string): Promise<MyOrgResponse> {
    return this.prisma.client.$transaction(async (tx) => {
      const organization = await this.orgs.create({ name }, tx);
      await this.orgs.addMember({ orgId: organization.id, userId, role: Role.OWNER }, tx);
      await this.audit.record(tx, {
        orgId: organization.id,
        actorId: userId,
        event: { action: "organization.created", schemaVersion: 1, payload: { name: organization.name } },
      });
      return { orgId: organization.id, name: organization.name, role: Role.OWNER };
    });
  }

  /**
   * Смена роли участника (Appendix B «Manage members & roles», O/A only).
   *
   * Чужой/несуществующий userId → 404, не 403: IDOR-паттерн, тот же, что у Blueprint
   * (§6 blueprints.md) — не подтверждаем чужому запросу, существует ли membership.
   */
  async changeMemberRole(orgId: string, actorId: string, targetUserId: string, role: Role): Promise<void> {
    const membership = await this.orgs.findMembership(orgId, targetUserId);
    if (!membership) throw new ResourceNotFoundError("Membership not found");

    // Понижаем ПОСЛЕДНЕГО OWNER — орга осталась бы без единственной роли, которой
    // доступно это же действие (Appendix B), т.е. без возможности когда-либо
    // восстановить управление. Считаем ДО апдейта — count включает самого targetUserId.
    if (membership.role === "OWNER" && role !== "OWNER" && (await this.orgs.countOwners(orgId)) <= 1) {
      throw new LastOwnerError();
    }

    await this.prisma.client.$transaction(async (tx) => {
      await this.orgs.updateMemberRole(orgId, targetUserId, role, tx);
      await this.audit.record(tx, {
        orgId,
        actorId,
        event: {
          action: "membership.role_changed",
          schemaVersion: 1,
          payload: {
            userId: targetUserId,
            userName: membership.userName,
            userEmail: membership.userEmail,
            fromRole: membership.role,
            toRole: role,
          },
        },
      });
    });
  }

  /**
   * Удаление участника из орги (Appendix B, O/A only). Те же два инварианта, что и
   * смена роли, плюс третий: у User по auth.md §9.1 всегда ≥1 Membership — если это
   * членство единственное, удаление сломало бы резолюцию activeOrgId на логине.
   */
  async removeMember(orgId: string, actorId: string, targetUserId: string): Promise<void> {
    const membership = await this.orgs.findMembership(orgId, targetUserId);
    if (!membership) throw new ResourceNotFoundError("Membership not found");

    if (membership.role === "OWNER" && (await this.orgs.countOwners(orgId)) <= 1) {
      throw new LastOwnerError();
    }
    if ((await this.orgs.countOrgsForUser(targetUserId)) <= 1) {
      throw new SoleOrganizationMembershipError();
    }

    await this.prisma.client.$transaction(async (tx) => {
      await this.orgs.removeMember(orgId, targetUserId, tx);
      await this.audit.record(tx, {
        orgId,
        actorId,
        event: {
          action: "membership.removed",
          schemaVersion: 1,
          payload: { userId: targetUserId, userName: membership.userName, userEmail: membership.userEmail, role: membership.role },
        },
      });
    });
  }

  /** Org-уровневый аудит (Appendix B, O/A only — см. CheckPolicy на контроллере). */
  async listAuditLog(orgId: string, query: AuditLogQuery): Promise<AuditLogListResponse> {
    const rows = await this.auditLog.list(orgId, { cursor: query.cursor, limit: query.limit });
    return rows.map((r) => ({
      id: r.id,
      actorId: r.actorId,
      actorName: r.actorName,
      actorEmail: r.actorEmail,
      action: r.action as AuditLogListResponse[number]["action"],
      payload: r.payload as Record<string, unknown>,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
