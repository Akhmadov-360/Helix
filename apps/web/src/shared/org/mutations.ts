import { useMutation } from "@tanstack/react-query";
import { authResultSchema, type SwitchOrgInput } from "@helix/api-schemas";
import { request } from "../api";
import { clearLastWorkspaceId } from "../lib/last-workspace";

// FR-ORG-2: смена активной орги.
//
// Полный reload на "/" (не SPA-навигация с queryClient.clear + setAccessToken) — сознательный выбор,
// НЕ дефолт по инерции: AppShell/Sidebar/UserMenu персистентны между роутами (app-shell.tsx: "не
// ремонтится на навигации"), поэтому у них уже смонтированные useSuspenseQuery(meQueryOptions)
// наблюдатели. clear() удаляет запись из кэша, но КАЖДЫЙ такой наблюдатель независимо перезапускает
// свой fetch — эмпирически поймана гонка: параллельный запрос с ещё не обновившимся токеном ловит
// 401, уходит в auto-refresh (refresh.ts), и его retry иногда резолвится ПОСЛЕ "правильного" fetch,
// перезаписывая кэш `me` данными старой орги (UI показывал старую оргу/роль, хотя API уже отвечал
// новой). setAccessToken на клиенте вообще не нужен для этого reload: switchOrg на бэке уже обновил
// remembered orgId в refresh-cookie (auth.service.ts), а `_authenticated`-загрузчик на холодном
// старте сам делает silent-refresh по этой cookie — тот же путь, что при обычном обновлении страницы.
export function useSwitchOrg() {
  return useMutation({
    mutationFn: (input: SwitchOrgInput) =>
      request({ method: "POST", path: "/v1/auth/switch-org", body: input, schema: authResultSchema }),
    onSuccess: () => {
      clearLastWorkspaceId();
      window.location.href = "/";
    },
  });
}
