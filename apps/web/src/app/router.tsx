import { createRouter } from "@tanstack/react-router";
import { routeTree } from "../routeTree.gen";
import { queryClient } from "./query-client";
import { RoutePending } from "./route-pending";

export const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
  // Владелец данных — Query, loader только греет кэш (§4.2). staleTime 0 → preload не навязывает
  // роутерную политику свежести поверх Query.
  defaultPreloadStaleTime: 0,
  // Без pendingComponent переход (lazy-чанк роута + loader) рисует пустой экран — выглядит как
  // зависание (login→"/", первый заход на вкладку). Ms/MinMs — та же пара, что дефолт роутера
  // (1000/500), но задаём явно: порог ДО показа скелета (не мигает на переходах быстрее сети)
  // и минимальное время ПОКАЗА (не мигает туда-обратно на переходах чуть медленнее порога).
  defaultPendingComponent: RoutePending,
  defaultPendingMs: 300,
  defaultPendingMinMs: 200,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
