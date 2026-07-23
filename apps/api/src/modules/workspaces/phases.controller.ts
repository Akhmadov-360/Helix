import { Body, Controller, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  createPhaseSchema,
  updatePhaseSchema,
  type CreatePhaseInput,
  type PhaseResponse,
  type UpdatePhaseInput,
} from "@helix/api-schemas";
import { CurrentAuth, type AuthContext } from "../../core/auth-context";
import { CheckPolicy } from "../../core/authz/check-policy.decorator";
import { PoliciesGuard } from "../../core/authz/policies.guard";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PhasesService } from "./phases.service";

// Пути заданы по-методно (@Controller без префикса): фаза — суб-ресурс воркспейса
// на создании, но самостоятельный на правке (§1). orgId — только из токена.
@ApiTags("phases")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller()
export class PhasesController {
  constructor(private readonly phases: PhasesService) {}

  @Post("workspaces/:workspaceId/phases")
  @CheckPolicy("create", "Phase")
  add(
    @CurrentAuth() auth: AuthContext,
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(createPhaseSchema)) dto: CreatePhaseInput,
  ): Promise<PhaseResponse> {
    return this.phases.add(auth.activeOrgId, workspaceId, dto);
  }

  @Patch("phases/:id")
  @CheckPolicy("update", "Phase")
  update(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updatePhaseSchema)) dto: UpdatePhaseInput,
  ): Promise<PhaseResponse> {
    return this.phases.update(auth.activeOrgId, id, dto);
  }
}
