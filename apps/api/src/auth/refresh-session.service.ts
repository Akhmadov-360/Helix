import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@helix/db";
import type { Env } from "@helix/config";
import type { Request } from "express";
import { ENV } from "../core/config/config.module";
import { InvalidRefreshTokenError } from "../core/errors/domain-error";
import { PrismaService } from "../core/prisma/prisma.service";
import { RefreshSessionsRepository } from "./refresh-sessions.repository";
import { generateRefreshToken, hashRefreshToken } from "./refresh-token";

/**
 * Метаданные устройства для будущего экрана «Настройки → Сессии» (§3).
 * `deviceName` не заполняем: он требует разбора user-agent, а тащить парсер ради
 * ещё не существующего экрана рано — сырой UA сохраняем, разберём когда понадобится.
 */
export interface SessionMetadata {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export function sessionMetadataFrom(request: Request): SessionMetadata {
  return {
    ipAddress: request.ip ?? null,
    userAgent: request.get("user-agent") ?? null,
  };
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class RefreshSessionService {
  constructor(
    private readonly sessions: RefreshSessionsRepository,
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Абсолютный TTL: срок считается от создания и активностью не продлевается (§3). */
  get ttlMs(): number {
    return this.env.REFRESH_TTL_DAYS * MS_PER_DAY;
  }

  /**
   * Заводит НОВУЮ цепочку сессий (свой `familyId`) и возвращает СЫРОЙ токен.
   * Это единственный момент, когда сырой токен существует на сервере: дальше он
   * уходит в httpOnly-cookie, а в БД остаётся только его SHA-256.
   *
   * Новый familyId на каждый вход — правильно: логин с другого устройства это
   * отдельная цепочка, и reuse-detection на одной не должна убивать другие.
   */
  async issue(
    params: { userId: string; activeOrgId: string; metadata?: SessionMetadata },
    tx?: Prisma.TransactionClient,
  ): Promise<string> {
    const rawToken = generateRefreshToken();

    await this.sessions.create(
      {
        userId: params.userId,
        tokenHash: hashRefreshToken(rawToken),
        familyId: randomUUID(),
        lastActiveOrgId: params.activeOrgId,
        expiresAt: new Date(Date.now() + this.ttlMs),
        ipAddress: params.metadata?.ipAddress ?? null,
        userAgent: params.metadata?.userAgent ?? null,
      },
      tx,
    );

    return rawToken;
  }

  /**
   * Отзыв сессии по сырому токену (logout, §7).
   *
   * Молча выходит, если сессии нет: цель операции — «этой сессии больше не
   * существует», и когда её и так нет, цель достигнута. Возвращать ошибку значило бы
   * заставлять клиента обрабатывать «вы уже вышли», а заодно превращать эндпоинт
   * в оракул существования токена.
   */
  async revokeByRawToken(rawToken: string, tx?: Prisma.TransactionClient): Promise<void> {
    const session = await this.sessions.findByTokenHash(hashRefreshToken(rawToken), tx);
    if (!session) return;

    await this.sessions.revoke(session.id, "LOGOUT", tx);
  }

  /**
   * Запоминает новую активную оргу на текущей сессии (switch-org, §6).
   * Best-effort: если сессии по токену нет, молча выходим — сам access-токен
   * с новой оргой уже выдан, а lastActiveOrgId лишь подсказка «куда вернуть».
   */
  async rememberActiveOrg(rawToken: string, orgId: string): Promise<void> {
    const session = await this.sessions.findByTokenHash(hashRefreshToken(rawToken));
    if (!session) return;

    await this.sessions.updateLastActiveOrg(session.id, orgId);
  }

  /**
   * Отзыв всех сессий пользователя (logout-all, §7) — на всех устройствах и во
   * всех цепочках. Идентификация идёт по userId из access-токена, а не по cookie:
   * это действие уровня аккаунта, а не текущей сессии.
   */
  async revokeAllForUser(userId: string, tx?: Prisma.TransactionClient): Promise<number> {
    return this.sessions.revokeAllForUser(userId, "LOGOUT", tx);
  }

  /**
   * Ротация refresh-токена — реализация инварианта «один refresh используется
   * РОВНО ОДИН РАЗ» (§5). Reuse detection это не отдельная фича, а контроль
   * того же инварианта.
   *
   * Схема ЯВНО такая: старой строке проставляется `usedAt`, создаётся НОВАЯ строка
   * с тем же `familyId`. Обновление `tokenHash` in-place ЗАПРЕЩЕНО (§5): оно затирает
   * старый хеш, и повторный приход старого токена становится неотличим от невалидного —
   * reuse detection умирает молча.
   *
   * ПОЧЕМУ ИСКЛЮЧЕНИЕ НЕ БРОСАЕТСЯ ВНУТРИ ТРАНЗАКЦИИ: throw откатил бы её вместе
   * с kill family, и отзыв цепочки не сохранился бы. Поэтому транзакция возвращает
   * ИСХОД, а 401 бросается уже после коммита.
   */
  async rotate(rawToken: string): Promise<RotationResult> {
    const outcome = await this.prisma.client.$transaction(
      async (tx): Promise<RotationOutcome> => {
        const session = await this.sessions.findByTokenHash(hashRefreshToken(rawToken), tx);

        if (!session) return { kind: "invalid" };
        if (session.revokedAt) return { kind: "invalid" };
        if (session.expiresAt <= new Date()) return { kind: "invalid" };

        if (session.usedAt) {
          // REUSE: токен уже ротирован, значит пришёл повтор. Отличить «вор прислал
          // старый» от «юзер пришёл со старым, после того как вор уже ротировал»
          // невозможно — поэтому единственное безопасное действие убить цепочку.
          // Простой отказ не спас бы: если ротировал вор, у него свежий валидный токен.
          await this.sessions.revokeFamily(session.familyId, "REUSE", tx);
          return { kind: "reuse" };
        }

        // Захватываем токен атомарно. count === 0 значит гонку выиграл параллельный
        // запрос: по строгой политике M0 (§5) это тот же класс события, что reuse.
        if ((await this.sessions.markUsed(session.id, tx)) === 0) {
          await this.sessions.revokeFamily(session.familyId, "REUSE", tx);
          return { kind: "reuse" };
        }

        const newRawToken = generateRefreshToken();
        await this.sessions.create(
          {
            userId: session.userId,
            tokenHash: hashRefreshToken(newRawToken),
            familyId: session.familyId, // та же цепочка
            lastActiveOrgId: session.lastActiveOrgId,
            // TTL АБСОЛЮТНЫЙ (§3): наследуем исходный expiresAt, НЕ выдаём новые N дней.
            // Иначе TTL стал бы скользящим и активная сессия жила бы вечно.
            expiresAt: session.expiresAt,
            // Метаданные происхождения сессии сохраняем: экран «Настройки → Сессии»
            // показывает, откуда вход начался, а свежесть отражает lastUsedAt.
            ipAddress: session.ipAddress,
            userAgent: session.userAgent,
          },
          tx,
        );

        return {
          kind: "rotated",
          newRawToken,
          userId: session.userId,
          lastActiveOrgId: session.lastActiveOrgId,
        };
      },
    );

    if (outcome.kind !== "rotated") throw new InvalidRefreshTokenError();
    return outcome;
  }
}

interface RotationResult {
  kind: "rotated";
  newRawToken: string;
  userId: string;
  lastActiveOrgId: string | null;
}

type RotationOutcome = RotationResult | { kind: "invalid" } | { kind: "reuse" };
