import { Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ForbiddenActionError, InvalidTokenError } from "../errors/domain-error";
import type { AuthenticatedRequest } from "../auth-context";
import { defineAbilityForRole } from "./app-ability";
import { CHECK_POLICY_KEY, type RequiredPolicy } from "./check-policy.decorator";

/**
 * Проверяет CASL-политику, объявленную через @CheckPolicy. Запускается ПОСЛЕ
 * JwtAuthGuard (тот кладёт role в request.auth). Без политики на ручке — пропускает
 * (идентичность и членство уже проверил JwtAuthGuard).
 */
@Injectable()
export class PoliciesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<RequiredPolicy | undefined>(CHECK_POLICY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const role = context.switchToHttp().getRequest<AuthenticatedRequest>().auth?.role;
    if (!role) throw new InvalidTokenError("PoliciesGuard requires JwtAuthGuard to run first");

    if (!defineAbilityForRole(role).can(required.action, required.subject)) {
      throw new ForbiddenActionError();
    }
    return true;
  }
}
