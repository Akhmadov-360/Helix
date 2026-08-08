import { queryOptions } from "@tanstack/react-query";
import { invitePreviewResponseSchema } from "@helix/api-schemas";
import { queryKeys, request } from "../../shared/api";

// Публичный (invites.md §6) — не требует access-токена, вызывается ДО того, как у принимающего
// вообще есть сессия. retry:false — невалидный токен не станет валидным от повторной попытки.
export function invitePreviewQueryOptions(token: string) {
  return queryOptions({
    queryKey: queryKeys.invitePreview(token),
    queryFn: () => request({ path: `/v1/invites/${token}`, schema: invitePreviewResponseSchema }),
    retry: false,
  });
}
