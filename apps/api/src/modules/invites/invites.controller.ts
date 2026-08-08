import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Req, Res, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  acceptInviteSchema,
  createInviteSchema,
  type AcceptInviteInput,
  type AuthResult,
  type CreateInviteInput,
  type InviteListResponse,
  type InvitePreviewResponse,
} from "@helix/api-schemas";
import type { Request, Response } from "express";
import { CurrentAuth, type AuthContext } from "../../core/auth-context";
import { CheckPolicy } from "../../core/authz/check-policy.decorator";
import { PoliciesGuard } from "../../core/authz/policies.guard";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RefreshCookieService } from "../auth/sessions/refresh-cookie.service";
import { sessionMetadataFrom } from "../auth/sessions/refresh-session.service";
import { InvitesService } from "./invites.service";

// Один контроллер, guard per-route (не class-level) — тот же приём, что AuthController:
// org-scoped мутаторы (create/list/revoke) закрыты, accept/preview публичны (личность
// подтверждает токен из письма, не access-токен — invites.md §2/§3).
@ApiTags("invites")
@Controller()
export class InvitesController {
  constructor(
    private readonly invites: InvitesService,
    private readonly refreshCookie: RefreshCookieService,
  ) {}

  @Post("organizations/invites")
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @ApiBearerAuth()
  @CheckPolicy("create", "Invite")
  async create(@CurrentAuth() auth: AuthContext, @Body(new ZodValidationPipe(createInviteSchema)) dto: CreateInviteInput): Promise<null> {
    await this.invites.create(auth.activeOrgId, auth.userId, auth.role, dto);
    return null;
  }

  @Get("organizations/invites")
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @ApiBearerAuth()
  @CheckPolicy("read", "Invite")
  list(@CurrentAuth() auth: AuthContext): Promise<InviteListResponse> {
    return this.invites.list(auth.activeOrgId);
  }

  @Delete("organizations/invites/:id")
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @ApiBearerAuth()
  @CheckPolicy("delete", "Invite")
  async revoke(@CurrentAuth() auth: AuthContext, @Param("id") id: string): Promise<null> {
    await this.invites.revoke(auth.activeOrgId, auth.userId, id);
    return null;
  }

  /** Guard'ом НЕ закрыт — рендерится ДО того, как у принимающего вообще есть сессия. */
  @Get("invites/:token")
  preview(@Param("token") token: string): Promise<InvitePreviewResponse> {
    return this.invites.preview(token);
  }

  /** Guard'ом НЕ закрыт (§3): владение токеном из письма само по себе подтверждает личность. */
  @Post("invites/:token/accept")
  @HttpCode(HttpStatus.OK)
  async accept(
    @Param("token") token: string,
    @Body(new ZodValidationPipe(acceptInviteSchema)) dto: AcceptInviteInput,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResult> {
    const { accessToken, refreshToken, user } = await this.invites.accept(token, dto, sessionMetadataFrom(request));
    this.refreshCookie.set(response, refreshToken);
    return { accessToken, user };
  }
}
