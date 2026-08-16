import { apiErrorResponseSchema } from "@helix/api-schemas";
import { getAccessToken } from "./access-token";
import { awaitPendingRefresh, refreshAccessToken, skipsAuthFlow } from "./refresh";
import { TransportError, transportKindForStatus } from "./transport-error";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export interface StreamRequestOptions {
  path: string;
  body?: unknown;
  signal?: AbortSignal;
}

async function sendStream(opts: StreamRequestOptions): Promise<Response> {
  const headers: Record<string, string> = {};
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";

  try {
    return await fetch(new URL(opts.path, API_BASE_URL), {
      method: "POST",
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      credentials: "include",
      signal: opts.signal,
    });
  } catch (cause) {
    throw new TransportError({ kind: "network", message: "Network request failed", cause });
  }
}

/**
 * ai-chat.md §4/§13.5 — единственный SSE-эндпоинт проекта: заголовки `text/event-stream`
 * отправляются сервером ТОЛЬКО после успешной подготовки (AiThreadsService.prepareChat), поэтому
 * обычная ошибка (404 тред, 422 провайдер не настроен) приходит сюда как ordinary JSON — тот же
 * error-конверт, что и `request()` в client.ts, тот же 401→refresh→retry (§8.1), не отдельный путь.
 * Как только ответ реально стримовый — читаем ReadableStream построчно, отдавая по одному
 * распарсенному JSON-объекту на "data: ...\n\n" SSE-блок. Схему конкретного события (`AiStreamEvent`)
 * знает вызывающий feature-модуль (§6.4: shared знает только транспорт, не домен).
 */
export async function* streamRequest(opts: StreamRequestOptions): AsyncGenerator<unknown, void> {
  if (!skipsAuthFlow(opts.path)) await awaitPendingRefresh();

  let res = await sendStream(opts);
  if (res.status === 401) {
    await refreshAccessToken();
    res = await sendStream(opts);
  }

  if (!res.ok || !res.body) {
    const json: unknown = await res.json().catch(() => undefined);
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

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      const trimmed = block.trim();
      if (!trimmed) continue;
      const jsonText = trimmed.startsWith("data:") ? trimmed.slice(5).trim() : trimmed;
      yield JSON.parse(jsonText) as unknown;
    }
  }
}
