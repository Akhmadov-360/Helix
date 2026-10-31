import { Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { InvalidTokenError, NoActiveOrgError, NotOrgMemberError } from "../../core/errors/domain-error";
import { OrganizationsRepository } from "../organizations/organizations.repository";
import type { AccountContext, AuthenticatedRequest } from "../../core/auth-context";
import { TokenService } from "./token.service";

const BEARER_PREFIX = "Bearer ";

/**
 * Полный guard (§10): подпись → членство → контекст.
 *
 * Два шага проверки принципиально разные:
 *  1) подпись токена отвечает «КТО ты» (identity) — этого хватало на шаге 4;
 *  2) чтение Membership отвечает «состоишь ли ты в орге, от имени которой пришёл».
 *     Без второго валидный токен исключённого сотрудника работал бы до своего exp.
 *
 * Роль читается из БД на КАЖДОМ запросе, а не берётся из токена (§6): одна индексная
 * выборка по (orgId, userId) на запрос — это цена, за которую мы получаем актуальные
 * права. Понижение роли и исключение из орги действуют мгновенно, а не через 15 минут.
 *
 * Проверку ПРАВ (что именно роль позволяет) guard не делает — это CASL, своя веха.
 */
async function resolveAccount(
  tokens: TokenService,
  organizations: OrganizationsRepository,
  request: AuthenticatedRequest,
): Promise<AccountContext> {
  const header = request.headers.authorization;

  if (!header?.startsWith(BEARER_PREFIX)) {
    throw new InvalidTokenError();
  }

  const payload = await tokens.verifyAccessToken(header.slice(BEARER_PREFIX.length).trim());
  if (payload.activeOrgId === null) {
    return { userId: payload.sub, activeOrgId: null, role: null };
  }

  const role = await organizations.findMembershipRole(payload.sub, payload.activeOrgId);
  if (!role) {
    throw new NotOrgMemberError();
  }
  return { userId: payload.sub, activeOrgId: payload.activeOrgId, role };
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly organizations: OrganizationsRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const account = await resolveAccount(this.tokens, this.organizations, request);

    if (account.activeOrgId === null || account.role === null) {
      throw new NoActiveOrgError();
    }

    request.auth = { userId: account.userId, activeOrgId: account.activeOrgId, role: account.role };
    return true;
  }
}

/**
 * Guard маршрутов уровня аккаунта: me, список своих орг, создание орги, switch-org, logout-all.
 * Пускает токен без активной организации; если активная названа, членство в ней всё равно
 * проверяется — иначе потерянная орга не отличалась бы от «орги нет» и 403-recovery клиента не сработал бы.
 */
@Injectable()
export class AccountGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly organizations: OrganizationsRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    request.account = await resolveAccount(this.tokens, this.organizations, request);
    return true;
  }
}
