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

// Идентичность запроса: профиль + activeOrgId + role (свежая из Membership, auth.md §6).
export const meQueryOptions = queryOptions({
  queryKey: queryKeys.me(),
  queryFn: () => request({ path: "/v1/auth/me", schema: currentUserSchema }),
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
      await queryClient.cancelQueries();
      queryClient.clear();
      void navigate({ to: "/login" });
    },
  });
}
