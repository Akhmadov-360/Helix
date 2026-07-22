import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Role } from "@helix/db";
import type { Role as ContractRole } from "@helix/api-schemas";
import type { Request } from "express";
import { InvalidTokenError } from "./errors/domain-error";

/**
 * Страж от расхождения источников. `Role` объявлен дважды: в schema.prisma (домен,
 * источник истины) и в api-schemas (контракт для фронта, который Prisma не подключает).
 * Взаимная проверка присваиваемости роняет СБОРКУ, если наборы разойдутся, — иначе
 * рассинхрон всплыл бы рантайм-ошибкой у клиента.
 */
// `_A` фигурирует только в ограничении — проверка и есть смысл этого типа.
type AssignableTo<_A extends B, B> = never;
type _DomainRoleFitsContract = AssignableTo<Role, ContractRole>;
type _ContractRoleFitsDomain = AssignableTo<ContractRole, Role>;

/**
 * Что guard кладёт в запрос: личность из подписи + роль, прочитанная из Membership.
 * `role` приходит ИЗ БД, а не из токена (§6) — поэтому она всегда актуальна.
 */
export interface AuthContext {
  userId: string;
  activeOrgId: string;
  role: Role;
  jti: string;
}

export interface AuthenticatedRequest extends Request {
  auth?: AuthContext;
}

/**
 * Достаёт auth-контекст в контроллере, чтобы тот не лез в сырой request.
 * Отсутствие контекста означает, что эндпоинт забыли закрыть guard'ом, —
 * это дефект конфигурации, поэтому ошибка, а не «молча undefined».
 */
export const CurrentAuth = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthContext => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.auth) {
      throw new InvalidTokenError("Route is not protected by JwtAuthGuard");
    }
    return request.auth;
  },
);
