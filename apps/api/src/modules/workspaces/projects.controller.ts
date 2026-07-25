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
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import {
  boardQuerySchema,
  columnQuerySchema,
  createProjectSchema,
  moveProjectSchema,
  updateProjectSchema,
  type ActivityEventResponse,
  type BoardQuery,
  type BoardResponse,
  type ColumnQuery,
  type ColumnResponse,
  type CreateProjectInput,
  type MoveProjectInput,
  type ProjectResponse,
  type UpdateProjectInput,
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

  @Post("projects/:id/archive")
  @HttpCode(HttpStatus.OK)
  @CheckPolicy("update", "Project")
  @ApiOkResponse({ description: "Лид отправлен в архив" })
  archive(@CurrentAuth() auth: AuthContext, @Param("id") id: string): Promise<ProjectResponse> {
    return this.projects.archive(auth.activeOrgId, auth.userId, id);
  }

  @Post("projects/:id/restore")
  @HttpCode(HttpStatus.OK)
  @CheckPolicy("update", "Project")
  @ApiOkResponse({ description: "Лид возвращён на доску (новый ранг наверх)" })
  restore(@CurrentAuth() auth: AuthContext, @Param("id") id: string): Promise<ProjectResponse> {
    return this.projects.restore(auth.activeOrgId, auth.userId, id);
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

  @Get("projects/:id")
  @CheckPolicy("read", "Project")
  getById(@CurrentAuth() auth: AuthContext, @Param("id") id: string): Promise<ProjectResponse> {
    return this.projects.getById(auth.activeOrgId, id);
  }

  @Get("projects/:id/activity")
  @CheckPolicy("read", "Project")
  activity(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
  ): Promise<ActivityEventResponse[]> {
    return this.projects.getActivity(auth.activeOrgId, id);
  }

  @Patch("projects/:id")
  @CheckPolicy("update", "Project")
  update(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateProjectSchema)) dto: UpdateProjectInput,
  ): Promise<ProjectResponse> {
    return this.projects.update(auth.activeOrgId, auth.userId, id, dto);
  }

  // DELETE — только O/A (§1): MANAGER не имеет delete Project.
  @Delete("projects/:id")
  @CheckPolicy("delete", "Project")
  async remove(@CurrentAuth() auth: AuthContext, @Param("id") id: string): Promise<null> {
    await this.projects.remove(auth.activeOrgId, id);
    return null;
  }
}
