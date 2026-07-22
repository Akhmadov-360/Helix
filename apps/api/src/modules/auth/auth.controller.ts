import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import {
  loginSchema,
  switchOrgSchema,
  type AuthResult,
  type CurrentUser,
  type LoginInput,
  type SwitchOrgInput,
} from "@helix/api-schemas";
import type { Request, Response } from "express";
import { InvalidRefreshTokenError, InvalidTokenError } from "../../core/errors/domain-error";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe";
import { UsersRepository } from "../users/users.repository";
import { CurrentAuth, type AuthContext } from "../../core/auth-context";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { REFRESH_COOKIE_NAME, RefreshCookieService } from "./sessions/refresh-cookie.service";
import { sessionMetadataFrom } from "./sessions/refresh-session.service";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersRepository,
    private readonly refreshCookie: RefreshCookieService,
  ) {}

  /**
   * 200, а не дефолтный для POST 201: логин ничего не создаёт, он проверяет
   * учётные данные. HTTP-кодов ошибок здесь нет — сервис бросает доменные ошибки,
   * статус выбирает AllExceptionsFilter.
   */
  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Выдан access-токен; refresh — в httpOnly-cookie" })
  async login(
    @Body(new ZodValidationPipe(loginSchema)) dto: LoginInput,
    @Req() request: Request,
    // passthrough: ставим cookie, но ответ по-прежнему формирует Nest —
    // ResponseTransformInterceptor продолжает оборачивать тело в конверт.
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResult> {
    const { accessToken, refreshToken, user } = await this.auth.login(
      dto,
      sessionMetadataFrom(request),
    );

    // Сырой refresh уходит ТОЛЬКО сюда. В теле его нет — там лишь access + профиль.
    this.refreshCookie.set(response, refreshToken);

    return { accessToken, user };
  }

  /**
   * Обмен refresh-cookie на новый access-токен. Guard'ом НЕ закрыт намеренно:
   * сюда приходят именно тогда, когда access уже протух.
   *
   * Тело запроса пустое — токен берётся из httpOnly-cookie, куда JS не дотянется.
   */
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Выданы новый access-токен и новый refresh (cookie)" })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResult> {
    const rawToken: unknown = request.cookies?.[REFRESH_COOKIE_NAME];

    if (typeof rawToken !== "string" || rawToken.length === 0) {
      throw new InvalidRefreshTokenError();
    }

    const { accessToken, refreshToken, user } = await this.auth.refresh(rawToken);

    // Перезаписываем cookie: старый токен только что стал одноразово потраченным,
    // и без этого клиент на следующем refresh прислал бы его снова — то есть сам
    // спровоцировал бы reuse detection и разлогин.
    this.refreshCookie.set(response, refreshToken);

    return { accessToken, user };
  }

  /**
   * Завершение текущей сессии (§7).
   *
   * Guard'ом НЕ закрыт намеренно: выйти нужно уметь и тогда, когда access уже
   * протух, — иначе пользователь заперт именно в тот момент, когда выход нужнее всего.
   * Сессию идентифицирует refresh-cookie.
   *
   * ИДЕМПОТЕНТЕН: нет cookie или сессия уже отозвана — всё равно успех. Цель
   * «сессии больше нет» в этих случаях уже достигнута, а 401 заставлял бы клиент
   * обрабатывать бессмысленную ошибку «вы уже вышли».
   *
   * Отдаём конверт с `data: null`, а не 204: по конвенции все ответы обёрнуты
   * в ApiResponse<T>, а у 204 тела нет вовсе.
   */
  @Post("logout")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Сессия завершена (идемпотентно)" })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<null> {
    const rawToken: unknown = request.cookies?.[REFRESH_COOKIE_NAME];

    if (typeof rawToken === "string" && rawToken.length > 0) {
      await this.auth.logout(rawToken);
    }

    // Cookie чистим всегда — даже если отзывать было нечего: у клиента не должно
    // остаться мёртвого токена, который он потом пришлёт и получит 401.
    this.refreshCookie.clear(response);

    return null;
  }

  /**
   * «Выйти на всех устройствах» (§7).
   *
   * В ОТЛИЧИЕ от /logout закрыт guard'ом, и это осознанно: действие разрушительно
   * для всего аккаунта, а Bearer-токен браузер не подставляет автоматически — значит
   * CSRF здесь невозможен структурно, а не «прикрыт SameSite». Цена — нужен живой
   * access-токен; если он протух, клиент сначала делает /refresh.
   *
   * Личность берём из токена, а не из cookie: это операция уровня АККАУНТА,
   * а не текущей сессии.
   */
  @Post("logout-all")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOkResponse({ description: "Все сессии пользователя завершены" })
  async logoutAll(
    @CurrentAuth() auth: AuthContext,
    @Res({ passthrough: true }) response: Response,
  ): Promise<null> {
    await this.auth.logoutAll(auth.userId);

    // Текущая сессия тоже отозвана — убираем и её cookie.
    this.refreshCookie.clear(response);

    return null;
  }

  /**
   * Профиль читается из БД, а НЕ из токена (§9): в токене его нет намеренно —
   * данные там протухли бы на срок жизни access-токена.
   */
  @Get("me")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOkResponse({ description: "Профиль и контекст текущего запроса" })
  async me(@CurrentAuth() auth: AuthContext): Promise<CurrentUser> {
    const profile = await this.users.findProfileById(auth.userId);

    if (!profile) {
      // Подпись валидна, но юзера нет — учётку удалили, пока токен жил.
      throw new InvalidTokenError("User no longer exists");
    }

    // Роль отдаём из контекста guard'а — она прочитана из Membership на этом же
    // запросе, поэтому не может быть устаревшей.
    return { ...profile, activeOrgId: auth.activeOrgId, role: auth.role };
  }

  /**
   * Смена активной организации (§6). Закрыта guard'ом: сменить оргу может только
   * тот, чья личность подтверждена.
   *
   * Refresh-cookie читаем дополнительно, чтобы запомнить выбор на сессии — иначе
   * следующий /refresh вернул бы юзера в прежнюю оргу.
   */
  @Post("switch-org")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOkResponse({ description: "Выдан access-токен для другой организации" })
  async switchOrg(
    @Body(new ZodValidationPipe(switchOrgSchema)) dto: SwitchOrgInput,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ): Promise<AuthResult> {
    const rawToken: unknown = request.cookies?.[REFRESH_COOKIE_NAME];

    return this.auth.switchOrg(
      auth.userId,
      dto.orgId,
      typeof rawToken === "string" && rawToken.length > 0 ? rawToken : undefined,
    );
  }
}
