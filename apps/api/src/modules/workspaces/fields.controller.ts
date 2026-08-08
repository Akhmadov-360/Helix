import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  createFieldDefinitionSchema,
  updateFieldDefinitionSchema,
  type CreateFieldDefinitionInput,
  type FieldDefinitionResponse,
  type UpdateFieldDefinitionInput,
} from "@helix/api-schemas";
import { CurrentAuth, type AuthContext } from "../../core/auth-context";
import { CheckPolicy } from "../../core/authz/check-policy.decorator";
import { PoliciesGuard } from "../../core/authz/policies.guard";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { FieldsService } from "./fields.service";

// custom-fields.md §1: то же путевое соглашение, что PhasesController — поле суб-ресурс
// воркспейса на создании, самостоятельный ресурс на правке/удалении.
@ApiTags("fields")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller()
export class FieldsController {
  constructor(private readonly fields: FieldsService) {}

  @Post("workspaces/:workspaceId/fields")
  @CheckPolicy("create", "FieldDefinition")
  add(
    @CurrentAuth() auth: AuthContext,
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(createFieldDefinitionSchema)) dto: CreateFieldDefinitionInput,
  ): Promise<FieldDefinitionResponse> {
    return this.fields.add(auth.activeOrgId, workspaceId, dto);
  }

  @Get("workspaces/:workspaceId/fields")
  @CheckPolicy("read", "FieldDefinition")
  list(
    @CurrentAuth() auth: AuthContext,
    @Param("workspaceId") workspaceId: string,
  ): Promise<FieldDefinitionResponse[]> {
    return this.fields.list(auth.activeOrgId, workspaceId);
  }

  @Patch("fields/:id")
  @CheckPolicy("update", "FieldDefinition")
  update(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateFieldDefinitionSchema)) dto: UpdateFieldDefinitionInput,
  ): Promise<FieldDefinitionResponse> {
    return this.fields.update(auth.activeOrgId, id, dto);
  }

  @Delete("fields/:id")
  @CheckPolicy("delete", "FieldDefinition")
  async remove(@CurrentAuth() auth: AuthContext, @Param("id") id: string): Promise<null> {
    await this.fields.remove(auth.activeOrgId, id);
    return null;
  }
}
