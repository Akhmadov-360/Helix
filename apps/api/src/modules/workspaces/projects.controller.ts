import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import {
  boardQuerySchema,
  columnQuerySchema,
  createProjectSchema,
  moveProjectSchema,
  type BoardQuery,
  type BoardResponse,
  type ColumnQuery,
  type ColumnResponse,
  type CreateProjectInput,
  type MoveProjectInput,
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

  // Смена фазы/позиции — не создание → 200. Политика update Project (O/A/M).
  @Post("projects/:id/move")
  @HttpCode(HttpStatus.OK)
  @CheckPolicy("update", "Project")
  @ApiOkResponse({ description: "Карточка перемещена (фаза/позиция)" })
  move(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(moveProjectSchema)) dto: MoveProjectInput,
  ): Promise<ProjectResponse> {
    return this.projects.move(auth.activeOrgId, auth.userId, id, dto);
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
