import { Injectable } from "@nestjs/common";
import { Role } from "@helix/db";
import {
  canGrantRole,
  canManageMember,
  type AuditLogListResponse,
  type AuditLogQuery,
  type MyOrgListResponse,
  type MyOrgResponse,
  type OrganizationSettings,
  type OrganizationSettingsResponse,
  type OrgMemberListResponse,
  type UpdateOrganizationSettingsInput,
} from "@helix/api-schemas";
import {
  InsufficientRoleRankError,
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
  async changeMemberRole(
    orgId: string,
    actorId: string,
    actorRole: Role,
    targetUserId: string,
    role: Role,
  ): Promise<void> {
    const membership = await this.orgs.findMembership(orgId, targetUserId);
    if (!membership) throw new ResourceNotFoundError("Membership not found");

    // Иерархия: actor может трогать target только со СТРОГО меньшим рангом (Admin не трогает
    // Admin/Owner). Self-action — исключение: собственное membership можно менять всегда, ранг
    // относительно самого себя тривиально равен (иначе не смогли бы понизить последнего Owner'а
    // при передаче ownership'а — важный сценарий, покрыт тестом "есть второй OWNER — первого
    // понизить можно"). canGrantRole всё равно применяется — включая self: MEMBER не может
    // промоут'нуть себя, ADMIN не может себе OWNER'а выдать.
    const isSelf = actorId === targetUserId;
    if (!isSelf && !canManageMember(actorRole, membership.role)) throw new InsufficientRoleRankError();
    if (!canGrantRole(actorRole, role)) throw new InsufficientRoleRankError();

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
  async removeMember(orgId: string, actorId: string, actorRole: Role, targetUserId: string): Promise<void> {
    const membership = await this.orgs.findMembership(orgId, targetUserId);
    if (!membership) throw new ResourceNotFoundError("Membership not found");

    // Иерархия: тот же чек, что в changeMemberRole, с тем же self-исключением (self-remove =
    // "покинуть организацию", валидный сценарий; инварианты "последний Owner" и "единственная
    // орга" ниже — реальные ограничители).
    const isSelf = actorId === targetUserId;
    if (!isSelf && !canManageMember(actorRole, membership.role)) throw new InsufficientRoleRankError();

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

  /** FR-ORG-3: текущие org-level settings. Читают все роли (см. app-ability.ts). */
  async getSettings(orgId: string): Promise<OrganizationSettingsResponse> {
    const org = await this.orgs.findSettings(orgId);
    if (!org) throw new ResourceNotFoundError("Organization not found");
    return { orgId, name: org.name, settings: (org.settings ?? {}) as OrganizationSettings };
  }

  /**
   * Партиальный merge: undefined-ключи во входе не трогают существующее значение (PATCH-семантика,
   * не PUT) — иначе фронт был бы обязан прислать все 4 группы полей на каждое сохранение формы.
   * changedKeys для аудита — только верхнеуровневые ключи, чьё значение реально отличается
   * (JSON.stringify-сравнение: значения — плоские объекты/примитивы, глубокий diff избыточен).
   *
   * name — ОТДЕЛЬНАЯ колонка (Organization.name), не часть JSON `settings` (нет дублирования
   * P1/P2), но приходит той же формой/PATCH-запросом — вынимаем из patch до merge в settings.
   */
  async updateSettings(orgId: string, actorId: string, patch: UpdateOrganizationSettingsInput): Promise<OrganizationSettingsResponse> {
    const org = await this.orgs.findSettings(orgId);
    if (!org) throw new ResourceNotFoundError("Organization not found");

    const { name, ...settingsPatch } = patch;
    const current = (org.settings ?? {}) as OrganizationSettings;
    const merged: OrganizationSettings = { ...current, ...settingsPatch };
    const changedKeys = Object.keys(settingsPatch).filter(
      (key) =>
        JSON.stringify(settingsPatch[key as keyof OrganizationSettings]) !== JSON.stringify(current[key as keyof OrganizationSettings]),
    );
    const nameChanged = name !== undefined && name !== org.name;
    if (nameChanged) changedKeys.push("name");

    if (changedKeys.length === 0) return { orgId, name: org.name, settings: current };

    await this.prisma.client.$transaction(async (tx) => {
      await this.orgs.updateSettings(orgId, { name: nameChanged ? name : undefined, settings: merged }, tx);
      await this.audit.record(tx, {
        orgId,
        actorId,
        event: { action: "organization.settings_updated", schemaVersion: 1, payload: { changedKeys } },
      });
    });

    return { orgId, name: nameChanged ? name : org.name, settings: merged };
  }

  /** Org-уровневый аудит (Appendix B, O/A only — см. CheckPolicy на контроллере). */
  async listAuditLog(orgId: string, query: AuditLogQuery): Promise<AuditLogListResponse> {
    const { rows, hasMore } = await this.auditLog.list(orgId, {
      cursor: query.cursor,
      limit: query.limit,
      action: query.action,
    });
    return {
      hasMore,
      entries: rows.map((r) => ({
        id: r.id,
        actorId: r.actorId,
        actorName: r.actorName,
        actorEmail: r.actorEmail,
        action: r.action as AuditLogListResponse["entries"][number]["action"],
        payload: r.payload as Record<string, unknown>,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }
}
