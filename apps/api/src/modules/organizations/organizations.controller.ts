import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  auditLogQuerySchema,
  changeMemberRoleSchema,
  createOrganizationSchema,
  updateOrganizationSettingsSchema,
  type AuditLogListResponse,
  type AuditLogQuery,
  type ChangeMemberRoleInput,
  type CreateOrganizationInput,
  type MyOrgListResponse,
  type MyOrgResponse,
  type OrganizationSettingsResponse,
  type OrgMemberListResponse,
  type UpdateOrganizationSettingsInput,
} from "@helix/api-schemas";
import { CurrentAuth, type AuthContext } from "../../core/auth-context";
import { CheckPolicy } from "../../core/authz/check-policy.decorator";
import { PoliciesGuard } from "../../core/authz/policies.guard";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { OrganizationsService } from "./organizations.service";

// orgId — только из токена (request.auth). PoliciesGuard стоит на уровне контроллера, но
// без @CheckPolicy пропускает (как GET /workspaces) — ростер орги читает любой участник
// (нужен всем пикерам — assignee/co-worker/reassign), не мутирующий эндпоинт.
@ApiTags("organizations")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller("organizations")
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get("members")
  listMembers(@CurrentAuth() auth: AuthContext): Promise<OrgMemberListResponse> {
    return this.organizations.listMembers(auth.activeOrgId);
  }

  // FR-ORG-2: список орг ТЕКУЩЕГО пользователя (не activeOrgId) — под org-switcher.
  @Get("mine")
  listMine(@CurrentAuth() auth: AuthContext): Promise<MyOrgListResponse> {
    return this.organizations.listMine(auth.userId);
  }

  // FR-ORG-2: дополнительная организация для существующего юзера. Без @CheckPolicy —
  // это не действие НАД текущей оргой (не Membership.create), а создание НОВОЙ, где
  // создатель сам становится OWNER; роль в activeOrgId тут ни при чём.
  @Post()
  create(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(createOrganizationSchema)) dto: CreateOrganizationInput,
  ): Promise<MyOrgResponse> {
    return this.organizations.create(auth.userId, dto.name);
  }

  // Appendix B «Manage members & roles» = O/A only.
  @Patch("members/:userId")
  @CheckPolicy("update", "Membership")
  @HttpCode(HttpStatus.OK)
  async changeMemberRole(
    @CurrentAuth() auth: AuthContext,
    @Param("userId") userId: string,
    @Body(new ZodValidationPipe(changeMemberRoleSchema)) dto: ChangeMemberRoleInput,
  ): Promise<null> {
    await this.organizations.changeMemberRole(auth.activeOrgId, auth.userId, auth.role, userId, dto.role);
    return null;
  }

  @Delete("members/:userId")
  @CheckPolicy("delete", "Membership")
  async removeMember(@CurrentAuth() auth: AuthContext, @Param("userId") userId: string): Promise<null> {
    await this.organizations.removeMember(auth.activeOrgId, auth.userId, auth.role, userId);
    return null;
  }

  // FR-ORG-3: настройки видят все роли (см. app-ability.ts) — без @CheckPolicy, как ростер.
  @Get("settings")
  getSettings(@CurrentAuth() auth: AuthContext): Promise<OrganizationSettingsResponse> {
    return this.organizations.getSettings(auth.activeOrgId);
  }

  // Appendix B «Manage org settings» = O/A only.
  @Patch("settings")
  @CheckPolicy("update", "Organization")
  updateSettings(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(updateOrganizationSettingsSchema)) dto: UpdateOrganizationSettingsInput,
  ): Promise<OrganizationSettingsResponse> {
    return this.organizations.updateSettings(auth.activeOrgId, auth.userId, dto);
  }

  // decisions.md D5: org-security-аудит, admin-only.
  @Get("audit-log")
  @CheckPolicy("read", "AuditLog")
  listAuditLog(
    @CurrentAuth() auth: AuthContext,
    @Query(new ZodValidationPipe(auditLogQuerySchema)) query: AuditLogQuery,
  ): Promise<AuditLogListResponse> {
    return this.organizations.listAuditLog(auth.activeOrgId, query);
  }
}
