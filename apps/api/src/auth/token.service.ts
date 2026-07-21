import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { InvalidTokenError } from "../core/errors/domain-error";

/**
 * Полезная нагрузка access-токена — МИНИМАЛЬНАЯ (§1 спеки).
 *
 * Чего здесь СОЗНАТЕЛЬНО нет:
 *  - `role` — устаревает: понизили Owner→Member, а токен ещё 15 минут говорит Owner.
 *    Читается из Membership свежей, один раз за запрос (§6).
 *  - `email`/`name` — P3 (минимум в токене) + всё равно протухнет; профиль берётся
 *    отдельным GET /v1/auth/me из БД.
 */
export interface AccessTokenPayload {
  /** userId (стандартное имя claim'а). */
  sub: string;
  activeOrgId: string;
  /** Уникален на каждый токен: задел под audit/tracing/отзыв. */
  jti: string;
}

type VerifiedPayload = AccessTokenPayload & { iat: number; exp: number };

@Injectable()
export class TokenService {
  constructor(private readonly jwt: JwtService) {}

  /** Секрет и TTL приходят из JwtModule (сконфигурирован из валидированного env). */
  async issueAccessToken(userId: string, activeOrgId: string): Promise<string> {
    const payload: AccessTokenPayload = {
      sub: userId,
      activeOrgId,
      jti: randomUUID(),
    };
    return this.jwt.signAsync(payload);
  }

  /**
   * Любая причина непригодности — битая подпись, истёкший срок, мусор вместо токена —
   * снаружи выглядит одинаково. Детали остаются в `cause` для логов, но клиенту знать,
   * ЧТО именно не так с токеном, незачем.
   */
  async verifyAccessToken(token: string): Promise<VerifiedPayload> {
    try {
      return await this.jwt.verifyAsync<VerifiedPayload>(token);
    } catch (error) {
      throw new InvalidTokenError(undefined, { cause: error });
    }
  }
}
