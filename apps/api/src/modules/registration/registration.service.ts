import { Injectable } from "@nestjs/common";
import { Role } from "@helix/db";
import type { RegisterInput } from "@helix/api-schemas";
import { AuthService, type IssuedAuth } from "../auth/auth.service";
import { PasswordService } from "../auth/password.service";
import type { SessionMetadata } from "../auth/sessions/refresh-session.service";
import { PrismaService } from "../../core/prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { OrganizationsRepository } from "../organizations/organizations.repository";
import { UsersRepository } from "../users/users.repository";

/**
 * Имя личной организации. Пока — имя самого пользователя: `Organization.name` это
 * простая строка (не LocalizedName), поэтому англоязычное «X's Organization» плохо
 * ложится на uz/ru/en. Переименование придёт с онбордингом (M1).
 */
function personalOrganizationName(userName: string): string {
  return userName;
}

/**
 * Application-сценарий регистрации (§9.1 спеки). Владеет ПОСЛЕДОВАТЕЛЬНОСТЬЮ и
 * ТРАНЗАКЦИОННОЙ ГРАНИЦЕЙ, но не реализует ни доменную логику, ни auth — координирует.
 *
 * Почему регистрация не в AuthService: auth отвечает на «кто ты» (пароль, токены,
 * ротация) и бизнес-сущности не создаёт. Создание User + Org + Membership — сценарий
 * приложения, который лишь ПОЛЬЗУЕТСЯ auth для хеширования.
 */
@Injectable()
export class RegistrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersRepository,
    private readonly organizations: OrganizationsRepository,
    private readonly passwords: PasswordService,
    private readonly auth: AuthService,
    private readonly notifications: NotificationsService,
  ) {}

  async register(input: RegisterInput, metadata?: SessionMetadata): Promise<IssuedAuth> {
    // Хешируем ДО транзакции: argon2id с 19 MiB занимает десятки миллисекунд, и
    // держать всё это время открытую транзакцию (соединение + блокировки) незачем.
    const passwordHash = await this.passwords.hash(input.password);

    // Инвариант §9.1: не бывает User без Membership. Записи создаются атомарно —
    // при падении любой (напр. занятый email) не остаётся ни осиротевшей орги, ни юзера.
    // RefreshSession входит в ту же транзакцию: по §9.1 факты-состояния атомарны,
    // побочные эффекты (welcome-email, дефолтный blueprint) идут после коммита (P4).
    const issued = await this.prisma.client.$transaction(async (tx) => {
      // Организация создаётся ПЕРВОЙ намеренно. Внутри транзакции порядок семантически
      // безразличен, но так падение на занятом email происходит ПОСЛЕ вставки орги —
      // и тест на атомарность становится наблюдаемым: без $transaction осталась бы
      // осиротевшая орга. При обратном порядке тест был бы зелёным всегда и ничего
      // не охранял.
      const organization = await this.organizations.create(
        { name: personalOrganizationName(input.name) },
        tx,
      );

      const user = await this.users.create(
        { email: input.email, name: input.name, passwordHash },
        tx,
      );

      await this.organizations.addMember(
        { orgId: organization.id, userId: user.id, role: Role.OWNER },
        tx,
      );

      // activeOrgId передаём явно — орга только что создана, искать её лишним
      // запросом не нужно (§9.1: активной становится личная орга).
      return this.auth.issueFor(user, {
        activeOrgId: organization.id,
        metadata,
        tx,
      });
    });

    // После коммита (P4) — регистрация уже необратима, письмо вторично; enqueueWelcome сам
    // глотает свою ошибку (см. NotificationsService), падение сюда не всплывёт.
    await this.notifications.enqueueWelcome({ email: input.email, name: input.name });

    return issued;
  }
}
