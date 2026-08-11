import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  createKbArticleSchema,
  listKbArticlesQuerySchema,
  updateKbArticleSchema,
  type CreateKbArticleInput,
  type KbArticleResponse,
  type ListKbArticlesQuery,
  type UpdateKbArticleInput,
} from "@helix/api-schemas";
import { CurrentAuth, type AuthContext } from "../../core/auth-context";
import { CheckPolicy } from "../../core/authz/check-policy.decorator";
import { PoliciesGuard } from "../../core/authz/policies.guard";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { KbService } from "./kb.service";

// pages-kb.md §7.
@ApiTags("kb-articles")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller("kb-articles")
export class KbController {
  constructor(private readonly kb: KbService) {}

  @Post()
  @CheckPolicy("create", "KBArticle")
  create(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(createKbArticleSchema)) dto: CreateKbArticleInput,
  ): Promise<KbArticleResponse> {
    return this.kb.create(auth.activeOrgId, dto);
  }

  @Get()
  @CheckPolicy("read", "KBArticle")
  list(
    @CurrentAuth() auth: AuthContext,
    @Query(new ZodValidationPipe(listKbArticlesQuerySchema)) query: ListKbArticlesQuery,
  ): Promise<KbArticleResponse[]> {
    return this.kb.list(auth.activeOrgId, query);
  }

  @Get(":id")
  @CheckPolicy("read", "KBArticle")
  findOne(@CurrentAuth() auth: AuthContext, @Param("id") id: string): Promise<KbArticleResponse> {
    return this.kb.findOne(auth.activeOrgId, id);
  }

  @Patch(":id")
  @CheckPolicy("update", "KBArticle")
  update(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateKbArticleSchema)) dto: UpdateKbArticleInput,
  ): Promise<KbArticleResponse> {
    return this.kb.update(auth.activeOrgId, id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.OK)
  @CheckPolicy("delete", "KBArticle")
  async remove(@CurrentAuth() auth: AuthContext, @Param("id") id: string): Promise<null> {
    await this.kb.remove(auth.activeOrgId, id);
    return null;
  }
}
