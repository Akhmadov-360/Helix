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
   *  - sameSite: браузер не пошлёт Lax-куку на cross-site fetch/XHR вообще (не только
   *    POST) — только на top-level GET-навигацию. Прод-деплой (Vercel + Railway) —
   *    РАЗНЫЕ домены, апи-запросы с фронта всегда cross-site → с Lax refresh-кука не
   *    доезжала НИКОГДА, бэк не видел токен, юзера выкидывало на login после первого
   *    же протухания access-токена (обнаружено вживую: hard-logout ровно на ~15 мин).
   *    None — обязателен для этой архитектуры (требует Secure, см. ниже). CSRF-риск
   *    на этом пути низкий: единственные эндпоинты под path — refresh (ротация токена,
   *    не даёт атакующему ничего читаемого из-за CORS+SOP) и logout (нет ценности для
   *    CSRF). В dev/http None невозможен без Secure — там остаётся Lax (localhost:PORT
   *    — один site независимо от порта, Lax там и так работает).
   *  - secure: cookie только по HTTPS — обязателен вместе с None, и то же условие
   *    (NODE_ENV=production) уже гарантирует HTTPS на Railway/Vercel.
   */
  private cookieOptions() {
    const secure = this.env.NODE_ENV === "production";
    return { httpOnly: true, sameSite: secure ? ("none" as const) : ("lax" as const), secure, path: REFRESH_COOKIE_PATH };
  }

  set(response: Response, rawToken: string): void {
    response.cookie(REFRESH_COOKIE_NAME, rawToken, {
      ...this.cookieOptions(),
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
    response.clearCookie(REFRESH_COOKIE_NAME, this.cookieOptions());
  }
}
