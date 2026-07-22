import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@helix/db";
import type { AuthResult, LoginInput, UserProfile } from "@helix/api-schemas";
import {
  InvalidCredentialsError,
  InvalidRefreshTokenError,
  InvalidTokenError,
  NotOrgMemberError,
} from "../../core/errors/domain-error";
import { OrganizationsRepository } from "../organizations/organizations.repository";
import { UsersRepository } from "../users/users.repository";
import { PasswordService } from "./password.service";
import { RefreshSessionService, type SessionMetadata } from "./sessions/refresh-session.service";
import { TokenService } from "./token.service";

/**
 * Внутренний результат аутентификации. НЕ равен `AuthResult` из api-schemas:
 * `refreshToken` — сырой токен, который уходит ТОЛЬКО в httpOnly-cookie и никогда
 * в тело ответа (§4). Разделение типов делает утечку в body ошибкой компиляции,
 * а не вопросом внимательности.
 */
export interface IssuedAuth {
  accessToken: string;
  refreshToken: string;
  user: UserProfile;
}

export interface IssueOptions {
  activeOrgId?: string;
  metadata?: SessionMetadata;
  tx?: Prisma.TransactionClient;
}

/**
 * Отвечает ТОЛЬКО на «кто ты» (§0 спеки): проверка пароля, выдача токенов, дальше —
 * их ротация. Бизнес-сущности не создаёт — это забота application-слоя
 * (см. RegistrationService).
 *
 * HTTP-кодов здесь нет: бросаем семантические доменные ошибки, статус выбирает
 * AllExceptionsFilter.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UsersRepository,
    private readonly organizations: OrganizationsRepository,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly refreshSessions: RefreshSessionService,
  ) {}

  async login(input: LoginInput, metadata?: SessionMetadata): Promise<IssuedAuth> {
    const user = await this.users.findByEmailWithHash(input.email);

    // Неизвестный email и SSO-only юзер (passwordHash = null) обрабатываются так же,
    // как неверный пароль: единый отказ на все три случая, иначе ответ становится
    // оракулом «такой email зарегистрирован».
    if (!user?.passwordHash) {
      // Считаем хеш вхолостую: без этого ответ на несуществующий email возвращался
      // бы за единицы мс, а на существующий — за десятки (argon2). Разница во времени
      // выдаёт наличие аккаунта не хуже, чем разный текст ошибки.
      await this.passwords.hash(input.password);
      throw new InvalidCredentialsError();
    }

    if (!(await this.passwords.verify(user.passwordHash, input.password))) {
      throw new InvalidCredentialsError();
    }

    await this.rehashIfNeeded(user.id, user.passwordHash, input.password);

    const profile: UserProfile = { id: user.id, email: user.email, name: user.name };
    return this.issueFor(profile, { metadata });
  }

  /**
   * Смена активной организации (§6). Access несёт `activeOrgId`, поэтому смена орги —
   * это переиздание токена, а не запись «текущей орги» где-то на сервере.
   *
   * Членство проверяется ЗДЕСЬ, до выдачи: иначе мы подписали бы токен на оргу,
   * доступа к которой нет, и отказ случился бы только на следующем запросе.
   */
  async switchOrg(userId: string, orgId: string, rawRefreshToken?: string): Promise<AuthResult> {
    if (!(await this.organizations.findMembershipRole(userId, orgId))) {
      throw new NotOrgMemberError();
    }

    const user = await this.users.findProfileById(userId);
    if (!user) throw new InvalidTokenError("User no longer exists");

    // Чтобы следующий refresh вернул юзера в новую оргу, а не в старую (§9.1).
    if (rawRefreshToken) {
      await this.refreshSessions.rememberActiveOrg(rawRefreshToken, orgId);
    }

    return {
      accessToken: await this.tokens.issueAccessToken(userId, orgId),
      user,
    };
  }

  /**
   * Завершение текущей сессии (§7).
   *
   * Access-токен НЕ отзывается — он stateless, «удалить JWT на сервере» невозможно:
   * он доживёт до своего exp (≤15 мин) и протухнет сам. Это не недосмотр, а прямое
   * следствие выбора stateless-access, и именно поэтому его TTL короткий.
   * Отзывается refresh — то, что позволило бы продлевать доступ дальше.
   */
  async logout(rawToken: string): Promise<void> {
    await this.refreshSessions.revokeByRawToken(rawToken);
  }

  /**
   * «Выйти на всех устройствах» (§7). Та же оговорка про access-токены: уже выданные
   * доживут до своего exp — мгновенно закрыть доступ везде stateless-схема не умеет.
   * Это цена, которую мы платим за отсутствие похода в БД на каждом запросе.
   */
  async logoutAll(userId: string): Promise<void> {
    await this.refreshSessions.revokeAllForUser(userId);
  }

  /**
   * Обмен refresh-токена на новую пару. Токен РОТИРУЕТСЯ: старый становится
   * недействительным, клиент получает новый в cookie (§5).
   *
   * Профиль читается из БД: за время жизни сессии имя могло измениться.
   */
  async refresh(rawToken: string): Promise<IssuedAuth> {
    const rotated = await this.refreshSessions.rotate(rawToken);

    const user = await this.users.findProfileById(rotated.userId);
    if (!user) {
      // Сессия жива, а юзера нет — учётку удалили. Каскад по FK такие строки уносит,
      // так что случай почти невозможен; отказываем так же, как на мёртвой сессии.
      throw new InvalidRefreshTokenError();
    }

    // Возвращаемся в ту оргу, где юзер работал в прошлый раз (§9.1). Fallback на
    // личную оргу — на случай строк, созданных до появления lastActiveOrgId.
    const orgId =
      rotated.lastActiveOrgId ?? (await this.organizations.findDefaultOrgIdForUser(user.id));
    if (!orgId) {
      throw new Error(`User ${user.id} has no membership; cannot resolve activeOrgId`);
    }

    return {
      accessToken: await this.tokens.issueAccessToken(user.id, orgId),
      refreshToken: rotated.newRawToken,
      user,
    };
  }

  /**
   * Выдача токенов для уже установленной личности. Публичный метод — им пользуется
   * RegistrationService (§9.1: регистрация создаёт сущности сама, а токены просит
   * у auth), передавая свою транзакцию.
   */
  async issueFor(user: UserProfile, options: IssueOptions = {}): Promise<IssuedAuth> {
    const orgId =
      options.activeOrgId ?? (await this.organizations.findDefaultOrgIdForUser(user.id));

    if (!orgId) {
      // Нарушен инвариант §9.1 «у каждого User есть ≥1 Membership». Это дефект данных,
      // а не пользовательская ошибка, — маскировать его под 401 нельзя.
      throw new Error(`User ${user.id} has no membership; cannot resolve activeOrgId`);
    }

    const accessToken = await this.tokens.issueAccessToken(user.id, orgId);
    const refreshToken = await this.refreshSessions.issue(
      { userId: user.id, activeOrgId: orgId, metadata: options.metadata },
      options.tx,
    );

    return { accessToken, refreshToken, user };
  }

  /**
   * Progressive rehash (§2 спеки): открытый пароль на руках только в этот момент,
   * поэтому пересчёт под актуальные параметры возможен именно здесь.
   *
   * Ошибку записи глотаем: апгрейд хеша — гигиена, а не условие входа. Уронить
   * успешный логин из-за неудавшегося косметического апдейта было бы хуже проблемы.
   */
  private async rehashIfNeeded(
    userId: string,
    currentHash: string,
    plainPassword: string,
  ): Promise<void> {
    if (!this.passwords.needsRehash(currentHash)) return;

    try {
      const upgraded = await this.passwords.hash(plainPassword);
      await this.users.updatePasswordHash(userId, upgraded);
      this.logger.log(`Password hash upgraded for user ${userId}`);
    } catch (error) {
      this.logger.warn(
        `Password rehash failed for user ${userId}; login proceeds`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
