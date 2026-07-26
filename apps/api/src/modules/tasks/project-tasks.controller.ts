import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { createTaskSchema, type CreateTaskInput, type TaskResponse } from "@helix/api-schemas";
import { CurrentAuth, type AuthContext } from "../../core/auth-context";
import { CheckPolicy } from "../../core/authz/check-policy.decorator";
import { PoliciesGuard } from "../../core/authz/policies.guard";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { TasksService } from "./tasks.service";

// Таски сделки. read — все; создание — Member+ (§2, часть «edit leads»). orgId из ALS; чужой проект → 404.
@ApiTags("tasks")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller("projects/:projectId/tasks")
export class ProjectTasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  @CheckPolicy("read", "Task")
  list(
    @CurrentAuth() auth: AuthContext,
    @Param("projectId") projectId: string,
  ): Promise<TaskResponse[]> {
    return this.tasks.list(auth.activeOrgId, projectId);
  }

  @Post()
  @CheckPolicy("create", "Task")
  create(
    @CurrentAuth() auth: AuthContext,
    @Param("projectId") projectId: string,
    @Body(new ZodValidationPipe(createTaskSchema)) dto: CreateTaskInput,
  ): Promise<TaskResponse> {
    return this.tasks.create(auth.activeOrgId, auth.userId, projectId, dto);
  }
}
