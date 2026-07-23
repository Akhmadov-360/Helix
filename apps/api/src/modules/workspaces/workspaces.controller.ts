import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  createWorkspaceSchema,
  reorderPhasesSchema,
  type CreateWorkspaceInput,
  type ReorderPhasesInput,
  type WorkspaceResponse,
} from "@helix/api-schemas";
import { CurrentAuth, type AuthContext } from "../../core/auth-context";
import { CheckPolicy } from "../../core/authz/check-policy.decorator";
import { PoliciesGuard } from "../../core/authz/policies.guard";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { WorkspacesService } from "./workspaces.service";

// orgId берётся ТОЛЬКО из ALS-контекста (токена), никогда из тела/query — иначе
// клиент создал бы ресурс в чужой орге (§1 спеки). Ролевые ограничения — через @CheckPolicy.
@ApiTags("workspaces")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller("workspaces")
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Post()
  @CheckPolicy("create", "Workspace")
  create(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(createWorkspaceSchema)) dto: CreateWorkspaceInput,
  ): Promise<WorkspaceResponse> {
    return this.workspaces.create(auth.activeOrgId, dto);
  }

  @Get()
  list(@CurrentAuth() auth: AuthContext): Promise<WorkspaceResponse[]> {
    return this.workspaces.list(auth.activeOrgId);
  }

  @Get(":id")
  getById(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
  ): Promise<WorkspaceResponse> {
    return this.workspaces.getById(auth.activeOrgId, id);
  }

  // Переупорядочивание — не создание ресурса → 200. Политика "update Phase":
  // reorder меняет порядок фаз (O/A/M), не сам воркспейс.
  @Post(":id/phases/reorder")
  @HttpCode(HttpStatus.OK)
  @CheckPolicy("update", "Phase")
  reorderPhases(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(reorderPhasesSchema)) dto: ReorderPhasesInput,
  ): Promise<WorkspaceResponse> {
    return this.workspaces.reorderPhases(auth.activeOrgId, id, dto);
  }
}
