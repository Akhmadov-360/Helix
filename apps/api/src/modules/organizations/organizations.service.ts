import { Injectable } from "@nestjs/common";
import { Role } from "@helix/db";
import type { MyOrgListResponse, MyOrgResponse, OrgMemberListResponse } from "@helix/api-schemas";
import {
  LastOwnerError,
  ResourceNotFoundError,
  SoleOrganizationMembershipError,
} from "../../core/errors/domain-error";
import { OrganizationsRepository } from "./organizations.repository";

@Injectable()
export class OrganizationsService {
  constructor(private readonly orgs: OrganizationsRepository) {}

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
   */
  async create(userId: string, name: string): Promise<MyOrgResponse> {
    const organization = await this.orgs.create({ name });
    await this.orgs.addMember({ orgId: organization.id, userId, role: Role.OWNER });
    return { orgId: organization.id, name: organization.name, role: Role.OWNER };
  }

  /**
   * Смена роли участника (Appendix B «Manage members & roles», O/A only).
   *
   * Чужой/несуществующий userId → 404, не 403: IDOR-паттерн, тот же, что у Blueprint
   * (§6 blueprints.md) — не подтверждаем чужому запросу, существует ли membership.
   */
  async changeMemberRole(orgId: string, targetUserId: string, role: Role): Promise<void> {
    const membership = await this.orgs.findMembership(orgId, targetUserId);
    if (!membership) throw new ResourceNotFoundError("Membership not found");

    // Понижаем ПОСЛЕДНЕГО OWNER — орга осталась бы без единственной роли, которой
    // доступно это же действие (Appendix B), т.е. без возможности когда-либо
    // восстановить управление. Считаем ДО апдейта — count включает самого targetUserId.
    if (membership.role === "OWNER" && role !== "OWNER" && (await this.orgs.countOwners(orgId)) <= 1) {
      throw new LastOwnerError();
    }

    await this.orgs.updateMemberRole(orgId, targetUserId, role);
  }

  /**
   * Удаление участника из орги (Appendix B, O/A only). Те же два инварианта, что и
   * смена роли, плюс третий: у User по auth.md §9.1 всегда ≥1 Membership — если это
   * членство единственное, удаление сломало бы резолюцию activeOrgId на логине.
   */
  async removeMember(orgId: string, targetUserId: string): Promise<void> {
    const membership = await this.orgs.findMembership(orgId, targetUserId);
    if (!membership) throw new ResourceNotFoundError("Membership not found");

    if (membership.role === "OWNER" && (await this.orgs.countOwners(orgId)) <= 1) {
      throw new LastOwnerError();
    }
    if ((await this.orgs.countOrgsForUser(targetUserId)) <= 1) {
      throw new SoleOrganizationMembershipError();
    }

    await this.orgs.removeMember(orgId, targetUserId);
  }
}
