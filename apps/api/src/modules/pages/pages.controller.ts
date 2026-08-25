import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  createPageCommentSchema,
  createPageSchema,
  listPagesQuerySchema,
  updatePageCommentSchema,
  updatePageSchema,
  type CreatePageCommentInput,
  type CreatePageInput,
  type ListPagesQuery,
  type PageCommentResponse,
  type PageResponse,
  type PageVersionListResponse,
  type UpdatePageCommentInput,
  type UpdatePageInput,
} from "@helix/api-schemas";
import { CurrentAuth, type AuthContext } from "../../core/auth-context";
import { CheckPolicy } from "../../core/authz/check-policy.decorator";
import { PoliciesGuard } from "../../core/authz/policies.guard";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PagesService } from "./pages.service";

// pages-kb.md §7. orgId только из токена; чужой/несуществующий id → 404 (тот же паттерн, что Attachment).
@ApiTags("pages")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller()
export class PagesController {
  constructor(private readonly pages: PagesService) {}

  @Post("projects/:projectId/pages")
  @CheckPolicy("create", "Page")
  create(
    @CurrentAuth() auth: AuthContext,
    @Param("projectId") projectId: string,
    @Body(new ZodValidationPipe(createPageSchema)) dto: CreatePageInput,
  ): Promise<PageResponse> {
    return this.pages.create(auth.activeOrgId, projectId, auth.userId, dto);
  }

  @Get("projects/:projectId/pages")
  @CheckPolicy("read", "Page")
  list(
    @CurrentAuth() auth: AuthContext,
    @Param("projectId") projectId: string,
    @Query(new ZodValidationPipe(listPagesQuerySchema)) query: ListPagesQuery,
  ): Promise<PageResponse[]> {
    return this.pages.list(auth.activeOrgId, projectId, query.q);
  }

  @Get("pages/:id")
  @CheckPolicy("read", "Page")
  findOne(@CurrentAuth() auth: AuthContext, @Param("id") id: string): Promise<PageResponse> {
    return this.pages.findOne(auth.activeOrgId, id);
  }

  @Patch("pages/:id")
  @CheckPolicy("update", "Page")
  update(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updatePageSchema)) dto: UpdatePageInput,
  ): Promise<PageResponse> {
    return this.pages.update(auth.activeOrgId, id, dto);
  }

  @Delete("pages/:id")
  @HttpCode(HttpStatus.OK)
  @CheckPolicy("delete", "Page")
  async remove(@CurrentAuth() auth: AuthContext, @Param("id") id: string): Promise<null> {
    await this.pages.remove(auth.activeOrgId, id, auth.userId);
    return null;
  }

  // §8 — история версий: право читать = право читать Page (включая Viewer).
  @Get("pages/:id/versions")
  @CheckPolicy("read", "Page")
  listVersions(@CurrentAuth() auth: AuthContext, @Param("id") id: string): Promise<PageVersionListResponse> {
    return this.pages.listVersions(auth.activeOrgId, id);
  }

  // Restore перезаписывает content — то же право, что update.
  @Post("pages/:id/versions/:versionId/restore")
  @CheckPolicy("update", "Page")
  restoreVersion(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Param("versionId") versionId: string,
  ): Promise<PageResponse> {
    return this.pages.restoreVersion(auth.activeOrgId, id, versionId);
  }

  // §4 — право комментировать = право читать Page (включая Viewer).
  @Post("pages/:id/comments")
  @CheckPolicy("read", "Page")
  addComment(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(createPageCommentSchema)) dto: CreatePageCommentInput,
  ): Promise<PageCommentResponse> {
    return this.pages.addComment(auth.activeOrgId, id, auth.userId, dto);
  }

  @Get("pages/:id/comments")
  @CheckPolicy("read", "Page")
  listComments(@CurrentAuth() auth: AuthContext, @Param("id") id: string): Promise<PageCommentResponse[]> {
    return this.pages.listComments(auth.activeOrgId, id);
  }

  // §4/§7 — авторизация НЕ через CASL (нет отдельного субъекта Comment): автор либо Manager+,
  // проверяется в сервисе. Guard'ы всё равно нужны для аутентификации (JwtAuthGuard).
  @Delete("pages/:id/comments/:commentId")
  @HttpCode(HttpStatus.OK)
  async deleteComment(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Param("commentId") commentId: string,
  ): Promise<null> {
    await this.pages.deleteComment(auth.activeOrgId, id, commentId, auth.userId, auth.role);
    return null;
  }

  // Автор-only (строже delete) — проверяется в сервисе, не CASL.
  @Patch("pages/:id/comments/:commentId")
  updateComment(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Param("commentId") commentId: string,
    @Body(new ZodValidationPipe(updatePageCommentSchema)) dto: UpdatePageCommentInput,
  ): Promise<PageCommentResponse> {
    return this.pages.updateComment(auth.activeOrgId, id, commentId, auth.userId, dto);
  }
}
