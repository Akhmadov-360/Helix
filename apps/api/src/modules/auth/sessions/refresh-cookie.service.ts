import { Inject, Injectable } from "@nestjs/common";
import type { Env } from "@helix/config";
import type { Response } from "express";
import { ENV } from "../../../core/config/config.module";

export const REFRESH_COOKIE_NAME = "helix_refresh";

/**
 * Cookie отправляется только на /v1/auth/* — единственные ручки, которым refresh
 * нужен (refresh, logout). Браузер не приложит её к остальным запросам, значит
 * токен не мелькает там, где не используется.
 */
export const REFRESH_COOKIE_PATH = "/v1/auth";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class RefreshCookieService {
  constructor(@Inject(ENV) private readonly env: Env) {}

  /**
   * Три флага закрывают ТРИ РАЗНЫЕ угрозы — их постоянно путают (§4, §8):
   *  - httpOnly: JS не прочитает cookie → XSS не украдёт refresh (главную ценность,
   *    т.к. он живёт неделями, в отличие от 15-минутного access).
   *  - sameSite=Lax: браузер не пошлёт cookie при cross-site POST → это защита от
   *    CSRF, а НЕ от XSS. Strict был бы строже, но ломает переход по внешней ссылке.
   *  - secure: cookie только по HTTPS. В dev по http://localhost её иначе просто
   *    не установить, поэтому флаг привязан к окружению.
   */
  set(response: Response, rawToken: string): void {
    response.cookie(REFRESH_COOKIE_NAME, rawToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: this.env.NODE_ENV === "production",
      path: REFRESH_COOKIE_PATH,
      maxAge: this.env.REFRESH_TTL_DAYS * MS_PER_DAY,
    });
  }

  /**
   * Атрибуты (path, httpOnly, sameSite, secure) обязаны совпадать с теми, что были
   * при установке — иначе браузер сочтёт это ДРУГОЙ cookie и старую не удалит.
   *
   * Само по себе удаление cookie ничего не защищает: настоящий выход — это отзыв
   * сессии в БД. Здесь мы лишь убираем со стороны клиента токен, который уже мёртв.
   */
  clear(response: Response): void {
    response.clearCookie(REFRESH_COOKIE_NAME, {
      httpOnly: true,
      sameSite: "lax",
      secure: this.env.NODE_ENV === "production",
      path: REFRESH_COOKIE_PATH,
    });
  }
}
