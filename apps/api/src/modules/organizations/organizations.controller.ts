import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { MyOrgListResponse, OrgMemberListResponse } from "@helix/api-schemas";
import { CurrentAuth, type AuthContext } from "../../core/auth-context";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { OrganizationsService } from "./organizations.service";

// orgId — только из токена (request.auth). Без @CheckPolicy (как GET /workspaces): ростер орги
// читает любой участник (нужен всем пикерам — assignee/co-worker/reassign), не мутирующий эндпоинт.
@ApiTags("organizations")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
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
}
