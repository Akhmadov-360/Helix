import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { assignSchema, type AssignInput, type ProjectAssigneeResponse } from "@helix/api-schemas";
import { CurrentAuth, type AuthContext } from "../../core/auth-context";
import { CheckPolicy } from "../../core/authz/check-policy.decorator";
import { PoliciesGuard } from "../../core/authz/policies.guard";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ProjectAssigneesService } from "./project-assignees.service";

// Co-workers сделки. read — все; назначение/снятие — Manager+ (§2: управленческое действие,
// одна модель прав с reassign owner). orgId только из токена (request.auth); чужой проект → 404.
@ApiTags("project-assignees")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller("projects/:projectId/assignees")
export class ProjectAssigneesController {
  constructor(private readonly assignees: ProjectAssigneesService) {}

  @Get()
  @CheckPolicy("read", "ProjectAssignee")
  list(
    @CurrentAuth() auth: AuthContext,
    @Param("projectId") projectId: string,
  ): Promise<ProjectAssigneeResponse[]> {
    return this.assignees.list(auth.activeOrgId, projectId);
  }

  @Post()
  @CheckPolicy("create", "ProjectAssignee")
  assign(
    @CurrentAuth() auth: AuthContext,
    @Param("projectId") projectId: string,
    @Body(new ZodValidationPipe(assignSchema)) dto: AssignInput,
  ): Promise<ProjectAssigneeResponse> {
    return this.assignees.assign(auth.activeOrgId, projectId, dto.userId);
  }

  @Delete(":userId")
  @HttpCode(HttpStatus.OK)
  @CheckPolicy("delete", "ProjectAssignee")
  async unassign(
    @CurrentAuth() auth: AuthContext,
    @Param("projectId") projectId: string,
    @Param("userId") userId: string,
  ): Promise<null> {
    await this.assignees.unassign(auth.activeOrgId, projectId, userId);
    return null;
  }
}
