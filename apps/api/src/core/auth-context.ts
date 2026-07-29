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

export interface AuthenticatedRequest extends Request {
  auth?: AuthContext;
}

// Достаёт auth из request в контроллере. Нет auth = эндпоинт забыли закрыть guard'ом → ошибка,
// а не молчаливый undefined, который упадёт где-то дальше.
export const CurrentAuth = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthContext => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.auth) {
      throw new InvalidTokenError("Route is not protected by JwtAuthGuard");
    }
    return request.auth;
  },
);
