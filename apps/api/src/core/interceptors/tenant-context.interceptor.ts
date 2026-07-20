import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from "@nestjs/common";
import { AsyncLocalStorage } from "node:async_hooks";
import { Observable } from "rxjs";
import type { Request } from "express";

export interface TenantContext {
  /** null = запрос без установленного тенанта (health, публичные эндпоинты). */
  orgId: string | null;
}

/** ALS-хранилище тенант-контекста. Data-access слой (M1) будет читать orgId отсюда. */
export const tenantStorage = new AsyncLocalStorage<TenantContext>();

/** Хелпер чтения текущего orgId (вне DI). */
export function currentOrgId(): string | null {
  return tenantStorage.getStore()?.orgId ?? null;
}

/**
 * ЗАГЛУШКА (M0): извлекает orgId из заголовка `x-org-id` и кладёт в ALS на время
 * запроса. В M2 источником станет аутентификация (JWT/сессия), а не заголовок.
 * Смысл сейчас — зафиксировать шов: сервисы/репозитории уже могут опираться на
 * currentOrgId(), не зная, откуда он берётся.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers["x-org-id"];
    const orgId = typeof header === "string" && header.length > 0 ? header : null;

    // Оборачиваем подписку в ALS-контекст, чтобы он жил на всём выполнении handler'а.
    return new Observable((subscriber) => {
      tenantStorage.run({ orgId }, () => {
        const sub = next.handle().subscribe(subscriber);
        return () => {
          sub.unsubscribe();
        };
      });
    });
  }
}
