import { z } from "zod";
import { apiErrorResponseSchema } from "@helix/api-schemas";
import { getAccessToken } from "./access-token";
import { awaitPendingRefresh, refreshAccessToken, skipsAuthFlow } from "./refresh";
import { TransportError, transportKindForStatus } from "./transport-error";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

// Обёртку success-конверта проверяем отдельно от полезной нагрузки: data парсит уже конкретная
// *ResponseSchema (schema.parse даёт z.infer<S> без generic-инференса по всему конверту).
const successEnvelopeSchema = z.object({
  success: z.literal(true),
  data: z.unknown(),
  timestamp: z.iso.datetime(),
});

type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";
type SearchParams = Record<string, string | number | boolean | undefined>;

interface RequestOptions<S extends z.ZodTypeAny> {
  path: string; // включает версию: "/v1/...", health — "/health"
  method?: HttpMethod;
  body?: unknown;
  searchParams?: SearchParams;
  schema: S; // *ResponseSchema — парсим по умолчанию (граница доверия = сеть, §6.2)
  validate?: boolean; // false → отключить рантайм-парс для ЭТОГО endpoint (не окружения)
  signal?: AbortSignal;
}

function buildUrl(path: string, searchParams?: SearchParams): string {
  const url = new URL(path, API_BASE_URL);
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function send<S extends z.ZodTypeAny>(opts: RequestOptions<S>): Promise<Response> {
  const { path, method = "GET", body, searchParams, signal } = opts;

  const headers: Record<string, string> = {};
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  try {
    return await fetch(buildUrl(path, searchParams), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      // refresh-cookie (httpOnly) должна ходить с запросами → /refresh, logout (веха B).
      credentials: "include",
      signal,
    });
  } catch (cause) {
    throw new TransportError({ kind: "network", message: "Network request failed", cause });
  }
}

async function parse<S extends z.ZodTypeAny>(res: Response, opts: RequestOptions<S>): Promise<z.infer<S>> {
  const { schema, validate = true } = opts;
  const json: unknown = await res.json().catch(() => undefined);

  if (!res.ok) {
    const parsed = apiErrorResponseSchema.safeParse(json);
    const error = parsed.success ? parsed.data.error : undefined;
    throw new TransportError({
      kind: transportKindForStatus(res.status),
      status: res.status,
      code: error?.code ?? null,
      details: error?.details,
      message: error?.message ?? `Request failed with status ${res.status}`,
    });
  }

  if (validate === false) {
    // Рантайм-парс отключён осознанно (§6.2) — но тип остаётся z.infer<S>, не any.
    return (json as { data: z.infer<S> }).data;
  }

  const envelope = successEnvelopeSchema.safeParse(json);
  if (!envelope.success) {
    throw new TransportError({
      kind: "unexpected",
      status: res.status,
      message: "Response envelope did not match the expected contract",
      cause: envelope.error,
    });
  }

  const data = schema.safeParse(envelope.data.data);
  if (!data.success) {
    throw new TransportError({
      kind: "unexpected",
      status: res.status,
      message: "Response payload did not match the expected contract",
      cause: data.error,
    });
  }
  return data.data as z.infer<S>;
}

/**
 * Единственная точка выхода в сеть (§6.1): разворачивает конверт, парсит по контракту,
 * нормализует ошибки в TransportError. Silent-refresh single-flight (§8.1, AUTH-1) подключён здесь:
 * проактивный lock перед отправкой + один post-refresh replay на 401 — единственный автоматический
 * retry во всём клиенте.
 */
export async function request<S extends z.ZodTypeAny>(opts: RequestOptions<S>): Promise<z.infer<S>> {
  const bypassAuthFlow = skipsAuthFlow(opts.path);

  if (!bypassAuthFlow) {
    // Не улетать со старым access, пока где-то уже идёт refresh (вторая гонка из §8.1).
    await awaitPendingRefresh();
  }

  const res = await send(opts);

  if (res.status === 401 && !bypassAuthFlow) {
    // refreshAccessToken — single-flight; бросит SessionExpiredError при неудаче, пробрасываем как есть.
    await refreshAccessToken();
    const retried = await send(opts);
    return parse(retried, opts);
  }

  return parse(res, opts);
}
