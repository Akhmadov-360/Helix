import { createRouter } from "@tanstack/react-router";
import { routeTree } from "../routeTree.gen";
import { queryClient } from "./query-client";

export const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
  // Владелец данных — Query, loader только греет кэш (§4.2). staleTime 0 → preload не навязывает
  // роутерную политику свежести поверх Query.
  defaultPreloadStaleTime: 0,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
