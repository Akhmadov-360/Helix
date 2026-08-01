import type { QueryClient } from "@tanstack/react-query";

// P0-AUTH-FE: смена идентичности → полная инвалидация клиентского контекста безопасности.
// Общий шаг для ручного logout и hard-logout при неудачном silent-refresh (§8.1) — разные триггеры,
// один и тот же инвариант (frontend-architecture.md §8, ADR-FE-4).
export async function invalidateSecurityContext(queryClient: QueryClient): Promise<void> {
  await queryClient.cancelQueries();
  queryClient.clear();
}
