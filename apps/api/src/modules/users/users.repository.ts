import { Injectable } from "@nestjs/common";
import type { Prisma } from "@helix/db";
import type { UserProfile } from "@helix/api-schemas";
import { PrismaService } from "../../core/prisma/prisma.service";

/**
 * Явный select вместо возврата всей строки: `passwordHash` не должен покидать
 * репозиторий случайно. Утечка секрета — не то, что ловится код-ревью раз в год.
 */
const PROFILE_SELECT = { id: true, email: true, name: true } as const;

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Принимает транзакцию (P4): регистрация создаёт User + Org + Membership атомарно,
   * и репозиторий обязан уметь работать внутри чужой транзакционной границы.
   *
   * Дубль email заранее не проверяем: `@unique` в БД — единственный источник истины,
   * pre-check создал бы гонку (два параллельных регистра прошли бы проверку оба).
   * P2002 превращается в 409 глобальным AllExceptionsFilter.
   */
  async create(
    data: { email: string; name: string; passwordHash: string },
    tx?: Prisma.TransactionClient,
  ): Promise<UserProfile> {
    return (tx ?? this.prisma.client).user.create({ data, select: PROFILE_SELECT });
  }

  /**
   * Единственный метод, отдающий `passwordHash` — он нужен логину для verify.
   * Наружу этот результат не уходит: AuthService возвращает профиль отдельно.
   */
  async findByEmailWithHash(
    email: string,
    tx?: Prisma.TransactionClient,
  ): Promise<{ id: string; email: string; name: string; passwordHash: string | null } | null> {
    return (tx ?? this.prisma.client).user.findUnique({
      where: { email },
      select: { ...PROFILE_SELECT, passwordHash: true },
    });
  }

  /** Профиль по id — источник данных для GET /v1/auth/me (из БД, не из токена). */
  async findProfileById(id: string, tx?: Prisma.TransactionClient): Promise<UserProfile | null> {
    return (tx ?? this.prisma.client).user.findUnique({ where: { id }, select: PROFILE_SELECT });
  }

  /** Progressive rehash: пересчёт хеша под текущую политику argon2. */
  async updatePasswordHash(
    userId: string,
    passwordHash: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await (tx ?? this.prisma.client).user.update({
      where: { id: userId },
      data: { passwordHash },
    });
  }
}
