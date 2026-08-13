import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  createUploadUrlSchema,
  downloadUrlQuerySchema,
  updateAttachmentSchema,
  type AttachmentResponse,
  type CreateUploadUrlInput,
  type DownloadUrlQuery,
  type DownloadUrlResponse,
  type StorageUsageResponse,
  type UpdateAttachmentInput,
  type UploadUrlResponse,
} from "@helix/api-schemas";
import { CurrentAuth, type AuthContext } from "../../core/auth-context";
import { CheckPolicy } from "../../core/authz/check-policy.decorator";
import { PoliciesGuard } from "../../core/authz/policies.guard";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AttachmentsService } from "./attachments.service";

// files.md §8. orgId только из токена (request.auth); чужой/несуществующий projectId → 404
// (assertProjectInOrg в сервисе, тот же паттерн, что ProjectAssignees/ProjectContacts).
@ApiTags("attachments")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller("projects/:projectId/attachments")
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Post("upload-url")
  @CheckPolicy("create", "Attachment")
  createUploadUrl(
    @CurrentAuth() auth: AuthContext,
    @Param("projectId") projectId: string,
    @Body(new ZodValidationPipe(createUploadUrlSchema)) dto: CreateUploadUrlInput,
  ): Promise<UploadUrlResponse> {
    return this.attachments.createUploadUrl(auth.activeOrgId, projectId, auth.userId, dto);
  }

  @Post(":attachmentId/confirm")
  @CheckPolicy("create", "Attachment")
  confirm(
    @CurrentAuth() auth: AuthContext,
    @Param("projectId") projectId: string,
    @Param("attachmentId") attachmentId: string,
  ): Promise<AttachmentResponse> {
    return this.attachments.confirm(auth.activeOrgId, projectId, attachmentId);
  }

  @Get()
  @CheckPolicy("read", "Attachment")
  list(
    @CurrentAuth() auth: AuthContext,
    @Param("projectId") projectId: string,
  ): Promise<AttachmentResponse[]> {
    return this.attachments.list(auth.activeOrgId, projectId);
  }

  @Get("storage-usage")
  @CheckPolicy("read", "Attachment")
  getStorageUsage(
    @CurrentAuth() auth: AuthContext,
    @Param("projectId") projectId: string,
  ): Promise<StorageUsageResponse> {
    return this.attachments.getStorageUsage(auth.activeOrgId, projectId);
  }

  @Get(":attachmentId/download-url")
  @CheckPolicy("read", "Attachment")
  getDownloadUrl(
    @CurrentAuth() auth: AuthContext,
    @Param("projectId") projectId: string,
    @Param("attachmentId") attachmentId: string,
    @Query(new ZodValidationPipe(downloadUrlQuerySchema)) query: DownloadUrlQuery,
  ): Promise<DownloadUrlResponse> {
    return this.attachments.getDownloadUrl(auth.activeOrgId, projectId, attachmentId, query.disposition);
  }

  @Patch(":attachmentId")
  @CheckPolicy("update", "Attachment")
  update(
    @CurrentAuth() auth: AuthContext,
    @Param("projectId") projectId: string,
    @Param("attachmentId") attachmentId: string,
    @Body(new ZodValidationPipe(updateAttachmentSchema)) dto: UpdateAttachmentInput,
  ): Promise<AttachmentResponse> {
    return this.attachments.update(auth.activeOrgId, projectId, attachmentId, dto);
  }

  @Delete(":attachmentId")
  @HttpCode(HttpStatus.OK)
  @CheckPolicy("delete", "Attachment")
  async delete(
    @CurrentAuth() auth: AuthContext,
    @Param("projectId") projectId: string,
    @Param("attachmentId") attachmentId: string,
  ): Promise<null> {
    await this.attachments.delete(auth.activeOrgId, projectId, attachmentId, auth.userId);
    return null;
  }
}
