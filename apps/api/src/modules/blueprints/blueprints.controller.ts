import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  blueprintQuerySchema,
  createBlueprintFromWorkspaceSchema,
  type BlueprintQuery,
  type BlueprintResponse,
  type CreateBlueprintFromWorkspaceInput,
} from "@helix/api-schemas";
import { CurrentAuth, type AuthContext } from "../../core/auth-context";
import { CheckPolicy } from "../../core/authz/check-policy.decorator";
import { PoliciesGuard } from "../../core/authz/policies.guard";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { BlueprintsService } from "./blueprints.service";

// orgId — только из токена (§1 спеки), никогда из тела/query.
@ApiTags("blueprints")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller("blueprints")
export class BlueprintsController {
  constructor(private readonly blueprints: BlueprintsService) {}

  @Get()
  @CheckPolicy("read", "Blueprint")
  list(
    @CurrentAuth() auth: AuthContext,
    @Query(new ZodValidationPipe(blueprintQuerySchema)) query: BlueprintQuery,
  ): Promise<BlueprintResponse[]> {
    return this.blueprints.list(auth.activeOrgId, query.audience);
  }

  // «Manage blueprints» = O/A only (§6) — строже, чем создание воркспейса вообще.
  @Post()
  @CheckPolicy("create", "Blueprint")
  create(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(createBlueprintFromWorkspaceSchema)) dto: CreateBlueprintFromWorkspaceInput,
  ): Promise<BlueprintResponse> {
    return this.blueprints.createFromWorkspace(auth.activeOrgId, dto);
  }

  @Delete(":id")
  @CheckPolicy("delete", "Blueprint")
  async remove(@CurrentAuth() auth: AuthContext, @Param("id") id: string): Promise<null> {
    await this.blueprints.remove(auth.activeOrgId, id);
    return null;
  }
}
