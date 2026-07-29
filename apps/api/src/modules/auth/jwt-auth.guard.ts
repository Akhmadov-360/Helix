import { Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { InvalidTokenError, NotOrgMemberError } from "../../core/errors/domain-error";
import { OrganizationsRepository } from "../organizations/organizations.repository";
import type { AuthenticatedRequest } from "../../core/auth-context";
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
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly organizations: OrganizationsRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;

    if (!header?.startsWith(BEARER_PREFIX)) {
      throw new InvalidTokenError();
    }

    const payload = await this.tokens.verifyAccessToken(header.slice(BEARER_PREFIX.length).trim());

    const role = await this.organizations.findMembershipRole(payload.sub, payload.activeOrgId);
    if (!role) {
      throw new NotOrgMemberError();
    }

    request.auth = {
      userId: payload.sub,
      activeOrgId: payload.activeOrgId,
      role,
    };
    return true;
  }
}
