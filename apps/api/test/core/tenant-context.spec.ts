import type { CallHandler, ExecutionContext } from "@nestjs/common";
import { Observable, lastValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";
import type { AuthContext } from "../../src/core/auth-context";
import {
  TenantContextInterceptor,
  currentTenant,
  type TenantContext,
} from "../../src/core/interceptors/tenant-context.interceptor";

/** Минимальный ExecutionContext: интерсептору нужен только request. */
function contextWith(auth?: AuthContext): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ auth }) }),
  } as unknown as ExecutionContext;
}

/**
 * Хендлер, который фиксирует, что видно из ALS в момент выполнения.
 * Это и есть проверка шва: M1-репозитории будут читать контекст ровно так же.
 */
function capturingHandler(sink: { seen?: TenantContext }): CallHandler {
  return {
    handle: () =>
      new Observable((subscriber) => {
        sink.seen = currentTenant();
        subscriber.next(null);
        subscriber.complete();
      }),
  };
}

describe("TenantContextInterceptor", () => {
  const interceptor = new TenantContextInterceptor();

  it("прокидывает в ALS то, что положил guard", async () => {
    const auth: AuthContext = {
      userId: "user-1",
      activeOrgId: "org-1",
      role: "ADMIN",
      jti: "jti-1",
    };
    const sink: { seen?: TenantContext } = {};

    await lastValueFrom(interceptor.intercept(contextWith(auth), capturingHandler(sink)));

    expect(sink.seen).toEqual({ userId: "user-1", orgId: "org-1", role: "ADMIN" });
  });

  it("на незащищённой ручке контекст анонимный, а не пустой объект", async () => {
    const sink: { seen?: TenantContext } = {};

    await lastValueFrom(interceptor.intercept(contextWith(undefined), capturingHandler(sink)));

    // Явные null, а не undefined: data-access слой должен уметь отличить
    // «тенант неизвестен» и отказать, а не молча выбрать всё.
    expect(sink.seen).toEqual({ userId: null, orgId: null, role: null });
  });

  it("контекст не протекает за пределы запроса", async () => {
    const auth: AuthContext = {
      userId: "user-1",
      activeOrgId: "org-1",
      role: "OWNER",
      jti: "jti-1",
    };

    await lastValueFrom(interceptor.intercept(contextWith(auth), capturingHandler({})));

    // Вне ALS-скоупа — анонимный контекст. Иначе один запрос видел бы тенанта другого.
    expect(currentTenant()).toEqual({ userId: null, orgId: null, role: null });
  });

  it("параллельные запросы не смешивают контексты", async () => {
    const makeAuth = (n: number): AuthContext => ({
      userId: `user-${n}`,
      activeOrgId: `org-${n}`,
      role: "MEMBER",
      jti: `jti-${n}`,
    });

    const sinks = [{}, {}, {}] as Array<{ seen?: TenantContext }>;

    await Promise.all(
      sinks.map((sink, i) =>
        lastValueFrom(interceptor.intercept(contextWith(makeAuth(i)), capturingHandler(sink))),
      ),
    );

    expect(sinks.map((s) => s.seen?.orgId)).toEqual(["org-0", "org-1", "org-2"]);
  });
});
