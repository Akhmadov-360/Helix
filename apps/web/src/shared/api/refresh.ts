import { authResultSchema } from "@helix/api-schemas";
import { request } from "./client";
import { setAccessToken } from "./access-token";
import { notifySessionExpired, SessionExpiredError } from "./session-expired";

export const REFRESH_PATH = "/v1/auth/refresh";
export const LOGIN_PATH = "/v1/auth/login";

// AUTH-1 / §8.1: одна refresh-cookie → ровно один одновременно выполняющийся refresh. Модульный
// промис — единственный choke-point для ВСЕХ конкурентных запросов (не per-request retry): refresh
// ротируется на бэке, второй параллельный /refresh с тем же токеном триггерит reuse-detection.
let inFlight: Promise<void> | null = null;

// Два обязательных исключения из auth-flow (§8.1): /refresh не оборачиваем в себя же (иначе цикл);
// /login 401 — доменные неверные креды, не протухший access, рефрешить нечего.
export function skipsAuthFlow(path: string): boolean {
  return path === REFRESH_PATH || path === LOGIN_PATH;
}

// Проактивный lock: любой исходящий запрос сначала ждёт уже идущий refresh, потом читает access
// из памяти — иначе запрос, стартующий во время refresh, улетит со старым (потраченным) токеном.
export function awaitPendingRefresh(): Promise<void> {
  return inFlight ?? Promise.resolve();
}

export function refreshAccessToken(): Promise<void> {
  if (!inFlight) {
    inFlight = performRefresh().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

async function performRefresh(): Promise<void> {
  try {
    const result = await request({ method: "POST", path: REFRESH_PATH, schema: authResultSchema });
    setAccessToken(result.accessToken);
  } catch (cause) {
    // Hard logout (P0-AUTH-FE): refresh FAIL → сессия мертва для всех, кто её ждёт.
    setAccessToken(null);
    notifySessionExpired();
    throw new SessionExpiredError(cause);
  }
}
