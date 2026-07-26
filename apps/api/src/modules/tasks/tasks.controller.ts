import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { updateTaskSchema, type TaskResponse, type UpdateTaskInput } from "@helix/api-schemas";
import { CurrentAuth, type AuthContext } from "../../core/auth-context";
import { CheckPolicy } from "../../core/authz/check-policy.decorator";
import { PoliciesGuard } from "../../core/authz/policies.guard";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { TasksService } from "./tasks.service";

// Операции над таском по его id (не знают проекта — tenant через orgId + composite backbone).
// Все — Member+ (§2). complete/reopen добавляются шагом 3.
@ApiTags("tasks")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller("tasks")
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Patch(":taskId")
  @CheckPolicy("update", "Task")
  update(
    @CurrentAuth() auth: AuthContext,
    @Param("taskId") taskId: string,
    @Body(new ZodValidationPipe(updateTaskSchema)) dto: UpdateTaskInput,
  ): Promise<TaskResponse> {
    return this.tasks.update(auth.activeOrgId, taskId, dto);
  }

  @Delete(":taskId")
  @CheckPolicy("delete", "Task")
  async remove(@CurrentAuth() auth: AuthContext, @Param("taskId") taskId: string): Promise<null> {
    await this.tasks.remove(auth.activeOrgId, taskId);
    return null;
  }

  // complete/reopen — отдельные action (§2): смена done с побочным эффектом (событие), не PATCH-поле.
  // Не создание → 200. Оба идемпотентны (§5). Политика update Task (Member+).
  @Post(":taskId/complete")
  @HttpCode(HttpStatus.OK)
  @CheckPolicy("update", "Task")
  complete(@CurrentAuth() auth: AuthContext, @Param("taskId") taskId: string): Promise<TaskResponse> {
    return this.tasks.complete(auth.activeOrgId, auth.userId, taskId);
  }

  @Post(":taskId/reopen")
  @HttpCode(HttpStatus.OK)
  @CheckPolicy("update", "Task")
  reopen(@CurrentAuth() auth: AuthContext, @Param("taskId") taskId: string): Promise<TaskResponse> {
    return this.tasks.reopen(auth.activeOrgId, taskId);
  }
}
