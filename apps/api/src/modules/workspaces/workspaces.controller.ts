import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  createWorkspaceSchema,
  reorderPhasesSchema,
  updateWorkspaceSchema,
  type CreateWorkspaceInput,
  type ReorderPhasesInput,
  type UpdateWorkspaceInput,
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

  @Patch(":id")
  @CheckPolicy("update", "Workspace")
  update(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateWorkspaceSchema)) dto: UpdateWorkspaceInput,
  ): Promise<WorkspaceResponse> {
    return this.workspaces.update(auth.activeOrgId, id, dto);
  }

  // delete Workspace — только OWNER/ADMIN (MANAGER не имеет manage/delete Workspace).
  @Delete(":id")
  @CheckPolicy("delete", "Workspace")
  async remove(@CurrentAuth() auth: AuthContext, @Param("id") id: string): Promise<null> {
    await this.workspaces.remove(auth.activeOrgId, id);
    return null;
  }
}
