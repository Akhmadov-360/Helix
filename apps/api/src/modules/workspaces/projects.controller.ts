import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiCreatedResponse, ApiTags } from "@nestjs/swagger";
import {
  boardQuerySchema,
  columnQuerySchema,
  createProjectSchema,
  type BoardQuery,
  type BoardResponse,
  type ColumnQuery,
  type ColumnResponse,
  type CreateProjectInput,
  type ProjectResponse,
} from "@helix/api-schemas";
import { CurrentAuth, type AuthContext } from "../../core/auth-context";
import { CheckPolicy } from "../../core/authz/check-policy.decorator";
import { PoliciesGuard } from "../../core/authz/policies.guard";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ProjectsService } from "./projects.service";

@ApiTags("projects")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller()
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  // Лид всегда в первую фазу воркспейса, наверх (§1). orgId/userId — только из токена.
  @Post("workspaces/:workspaceId/projects")
  @CheckPolicy("create", "Project")
  @ApiCreatedResponse({ description: "Лид создан в первой фазе, наверху колонки" })
  create(
    @CurrentAuth() auth: AuthContext,
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(createProjectSchema)) dto: CreateProjectInput,
  ): Promise<ProjectResponse> {
    return this.projects.create(auth.activeOrgId, auth.userId, workspaceId, dto);
  }

  @Get("workspaces/:workspaceId/board")
  @CheckPolicy("read", "Project")
  board(
    @CurrentAuth() auth: AuthContext,
    @Param("workspaceId") workspaceId: string,
    @Query(new ZodValidationPipe(boardQuerySchema)) query: BoardQuery,
  ): Promise<BoardResponse> {
    return this.projects.getBoard(auth.activeOrgId, workspaceId, query.limitPerPhase);
  }

  @Get("phases/:phaseId/projects")
  @CheckPolicy("read", "Project")
  column(
    @CurrentAuth() auth: AuthContext,
    @Param("phaseId") phaseId: string,
    @Query(new ZodValidationPipe(columnQuerySchema)) query: ColumnQuery,
  ): Promise<ColumnResponse> {
    return this.projects.getColumn(auth.activeOrgId, phaseId, query);
  }
}
