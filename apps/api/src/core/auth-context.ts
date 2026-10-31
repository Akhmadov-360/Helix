import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Role } from "@helix/db";
import type { Role as ContractRole } from "@helix/api-schemas";
import type { Request } from "express";
import { InvalidTokenError } from "./errors/domain-error";

// Parity-guard: Role объявлена и в schema.prisma (домен), и в api-schemas (контракт). Эти типы
// роняют СБОРКУ, если наборы ролей разойдутся (проверка = сам факт их существования, не мёртвый код).
type AssignableTo<_A extends B, B> = never;
type _DomainRoleFitsContract = AssignableTo<Role, ContractRole>;
type _ContractRoleFitsDomain = AssignableTo<ContractRole, Role>;

// Что guard кладёт в request.auth. role — из БД (Membership), не из токена → всегда актуальна.
export interface AuthContext {
  userId: string;
  activeOrgId: string;
  role: Role;
}

// Контекст маршрутов уровня аккаунта (AccountGuard): личность подтверждена, активной орги может не быть.
// Репозитории тенантных данных принимают orgId: string — получить его из AccountContext без явной
// проверки на null нельзя, поэтому «аккаунт без орги» не может протечь в тенантные запросы.
export interface AccountContext {
  userId: string;
  activeOrgId: string | null;
  role: Role | null;
}

export interface AuthenticatedRequest extends Request {
  auth?: AuthContext;
  account?: AccountContext;
}

// Достаёт auth из request в контроллере. Нет auth = эндпоинт забыли закрыть guard'ом → ошибка,
// а не молчаливый undefined, который упадёт где-то дальше.
export const CurrentAccount = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AccountContext => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.account) {
      throw new InvalidTokenError("Route is not protected by AccountGuard");
    }
    return request.account;
  },
);

export const CurrentAuth = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthContext => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.auth) {
      throw new InvalidTokenError("Route is not protected by JwtAuthGuard");
    }
    return request.auth;
  },
);
