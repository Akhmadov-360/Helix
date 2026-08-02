import { z } from "zod";
import {
  queryOptions,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { currentUserSchema } from "@helix/api-schemas";
import { queryKeys, request, setAccessToken } from "../api";
import { clearLastWorkspaceId } from "../lib/last-workspace";
import { invalidateSecurityContext } from "./invalidate-session";

// Идентичность запроса: профиль + activeOrgId + role (свежая из Membership, auth.md §6).
// Читается почти в каждом loader'е (10+ роутов) — без явного staleTime падал бы под общий
// дефолт 15s (query-client.ts) наравне с совместно редактируемыми ресурсами, хотя роль/оргу
// меняют редко и не другой пользователь «прямо сейчас». Реальная смена прав всё равно долетает
// мгновенно — не через ожидание staleTime, а через явный invalidateQueries(me()) на 403 в мутациях.
export const meQueryOptions = queryOptions({
  queryKey: queryKeys.me(),
  queryFn: () => request({ path: "/v1/auth/me", schema: currentUserSchema }),
  staleTime: 120_000,
});

export function useMe() {
  return useSuspenseQuery(meQueryOptions).data;
}

export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: () => request({ method: "POST", path: "/v1/auth/logout", schema: z.null() }),
    // P0-AUTH-FE: смена идентичности → полная инвалидация контекста безопасности. onSettled, а не
    // onSuccess: сессию на клиенте гасим даже если запрос не дошёл (цель «выйти» уже достигнута).
    onSettled: async () => {
      setAccessToken(null);
      clearLastWorkspaceId();
      await invalidateSecurityContext(queryClient);
      void navigate({ to: "/login" });
    },
  });
}
