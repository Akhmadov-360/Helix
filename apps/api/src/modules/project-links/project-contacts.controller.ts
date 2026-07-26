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
  linkContactSchema,
  updateLinkSchema,
  type LinkContactInput,
  type ProjectContactResponse,
  type UpdateLinkInput,
} from "@helix/api-schemas";
import { CurrentAuth, type AuthContext } from "../../core/auth-context";
import { CheckPolicy } from "../../core/authz/check-policy.decorator";
import { PoliciesGuard } from "../../core/authz/policies.guard";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ProjectContactsService } from "./project-contacts.service";

// Состав сделки. read — все; мутации — Member+ (§2: работа с составом = «edit leads» △).
// orgId только из ALS; чужой проект/контакт → 404.
@ApiTags("project-contacts")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller("projects/:projectId/contacts")
export class ProjectContactsController {
  constructor(private readonly links: ProjectContactsService) {}

  @Get()
  @CheckPolicy("read", "ProjectContact")
  list(
    @CurrentAuth() auth: AuthContext,
    @Param("projectId") projectId: string,
  ): Promise<ProjectContactResponse[]> {
    return this.links.list(auth.activeOrgId, projectId);
  }

  @Post()
  @CheckPolicy("create", "ProjectContact")
  link(
    @CurrentAuth() auth: AuthContext,
    @Param("projectId") projectId: string,
    @Body(new ZodValidationPipe(linkContactSchema)) dto: LinkContactInput,
  ): Promise<ProjectContactResponse> {
    return this.links.link(auth.activeOrgId, projectId, dto);
  }

  @Patch(":contactId")
  @CheckPolicy("update", "ProjectContact")
  updateRoles(
    @CurrentAuth() auth: AuthContext,
    @Param("projectId") projectId: string,
    @Param("contactId") contactId: string,
    @Body(new ZodValidationPipe(updateLinkSchema)) dto: UpdateLinkInput,
  ): Promise<ProjectContactResponse> {
    return this.links.updateRoles(auth.activeOrgId, projectId, contactId, dto.roles);
  }

  @Delete(":contactId")
  @HttpCode(HttpStatus.OK)
  @CheckPolicy("delete", "ProjectContact")
  async unlink(
    @CurrentAuth() auth: AuthContext,
    @Param("projectId") projectId: string,
    @Param("contactId") contactId: string,
  ): Promise<null> {
    await this.links.unlink(auth.activeOrgId, projectId, contactId);
    return null;
  }
}
