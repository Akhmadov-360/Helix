import { Injectable } from "@nestjs/common";
import { InvalidPasswordResetTokenError } from "../../../core/errors/domain-error";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { NotificationsService } from "../../notifications/notifications.service";
import { UsersRepository } from "../../users/users.repository";
import { PasswordService } from "../password.service";
import { RefreshSessionService } from "../sessions/refresh-session.service";
import { PasswordResetRepository } from "./password-reset.repository";
import { generateResetToken, hashResetToken } from "./password-reset-token";

/** Короче TTL refresh-сессии (auth.md §3): узкое окно атаки на потерянное письмо. */
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 час

@Injectable()
export class PasswordResetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: PasswordResetRepository,
    private readonly users: UsersRepository,
    private readonly passwords: PasswordService,
    private readonly refreshSessions: RefreshSessionService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Запрос сброса. Молчаливый успех независимо от того, существует ли email
   * (тот же приём, что login §InvalidCredentials): иначе ответ стал бы оракулом
   * существования аккаунта.
   */
  async requestReset(email: string): Promise<void> {
    const user = await this.users.findByEmailWithHash(email);
    if (!user) return;

    const rawToken = generateResetToken();
    await this.tokens.create({
      userId: user.id,
      tokenHash: hashResetToken(rawToken),
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    });

    await this.notifications.enqueuePasswordReset({ email: user.email, name: user.name, token: rawToken });
  }

  /**
   * Смена пароля по токену из письма. Отзываем ВСЕ refresh-сессии пользователя
   * (PASSWORD_CHANGED): если пароль меняли из-за утечки, украденные refresh-токены
   * не должны продолжать работать после смены.
   */
  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const record = await this.tokens.findValidByTokenHash(hashResetToken(rawToken));
    if (!record) throw new InvalidPasswordResetTokenError();

    const passwordHash = await this.passwords.hash(newPassword);

    await this.prisma.client.$transaction(async (tx) => {
      // Компенсирует гонку двух одновременных reset по одному токену: второй увидит
      // count 0 и откатится, не тронув пароль дважды и не оставив мёртвую запись.
      if ((await this.tokens.markUsed(record.id, tx)) === 0) {
        throw new InvalidPasswordResetTokenError();
      }
      await this.users.updatePasswordHash(record.userId, passwordHash, tx);
      await this.refreshSessions.revokeAllForUser(record.userId, tx, "PASSWORD_CHANGED");
    });
  }
}
