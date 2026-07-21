import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from "@nestjs/common";
import { AsyncLocalStorage } from "node:async_hooks";
import type { Role } from "@helix/db";
import { Observable } from "rxjs";
import type { AuthenticatedRequest } from "../../auth/auth-context";

export interface TenantContext {
  /** null на публичных ручках (health, login, register, refresh). */
  userId: string | null;
  orgId: string | null;
  role: Role | null;
}

const ANONYMOUS: TenantContext = { userId: null, orgId: null, role: null };

/** ALS-хранилище тенант-контекста запроса. */
export const tenantStorage = new AsyncLocalStorage<TenantContext>();

/**
 * Текущий тенант-контекст. Data-access слой (M1) будет скоупить по нему запросы,
 * не прокидывая orgId через все сигнатуры вручную.
 */
export function currentTenant(): TenantContext {
  return tenantStorage.getStore() ?? ANONYMOUS;
}

/**
 * Кладёт в ALS то, что установил JwtAuthGuard.
 *
 * ПОРЯДОК: в Nest guards выполняются ДО интерсепторов, поэтому к моменту вызова
 * `request.auth` уже заполнен. Сам guard положить контекст в ALS не может — он
 * возвращает boolean и не оборачивает выполнение handler'а, а ALS требует
 * охватывающего вызова.
 *
 * На незащищённых ручках контекст анонимный: это не ошибка, а честное «тенант
 * неизвестен» — тогда data-access слой обязан отказать, а не молча взять всё.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const auth = request.auth;

    const tenant: TenantContext = auth
      ? { userId: auth.userId, orgId: auth.activeOrgId, role: auth.role }
      : ANONYMOUS;

    return new Observable((subscriber) => {
      tenantStorage.run(tenant, () => {
        const sub = next.handle().subscribe(subscriber);
        return () => {
          sub.unsubscribe();
        };
      });
    });
  }
}
