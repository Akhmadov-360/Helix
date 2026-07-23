import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  createWorkspaceSchema,
  type CreateWorkspaceInput,
  type WorkspaceResponse,
} from "@helix/api-schemas";
import { CurrentAuth, type AuthContext } from "../../core/auth-context";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { WorkspacesService } from "./workspaces.service";

// orgId берётся ТОЛЬКО из ALS-контекста (токена), никогда из тела/query — иначе
// клиент создал бы ресурс в чужой орге (§1 спеки). Ролевое ограничение O/A/M — единица C.
@ApiTags("workspaces")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("workspaces")
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Post()
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
}
