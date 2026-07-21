import { Body, Controller, Post, Req, Res } from "@nestjs/common";
import { ApiCreatedResponse, ApiTags } from "@nestjs/swagger";
import { registerSchema, type AuthResult, type RegisterInput } from "@helix/api-schemas";
import type { Request, Response } from "express";
import { RefreshCookieService } from "../auth/refresh-cookie.service";
import { sessionMetadataFrom } from "../auth/refresh-session.service";
import { ZodValidationPipe } from "../core/pipes/zod-validation.pipe";
import { RegistrationService } from "./registration.service";

/**
 * Путь эндпоинта — /v1/auth/register (§9), но контроллер живёт в модуле регистрации,
 * а не в auth: регистрация это application-сценарий, и её HTTP-поверхность принадлежит
 * ей же. Держать её в AuthController пришлось бы ценой цикла между модулями
 * (auth нужен регистрации для выдачи токенов, регистрация — контроллеру auth).
 */
@ApiTags("auth")
@Controller("auth")
export class RegistrationController {
  constructor(
    private readonly registration: RegistrationService,
    private readonly refreshCookie: RefreshCookieService,
  ) {}

  @Post("register")
  @ApiCreatedResponse({ description: "Создан пользователь с личной организацией, выдан токен" })
  async register(
    @Body(new ZodValidationPipe(registerSchema)) dto: RegisterInput,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResult> {
    const { accessToken, refreshToken, user } = await this.registration.register(
      dto,
      sessionMetadataFrom(request),
    );

    this.refreshCookie.set(response, refreshToken);

    return { accessToken, user };
  }
}
