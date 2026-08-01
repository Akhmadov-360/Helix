// Терминальный auth-исход (§8.1, P0-AUTH-FE), отдельный от TransportError: refresh не удался →
// identity больше не валиден. НЕ 401/Network/Forbidden — вызывающий код не должен рисовать error UI,
// редирект на /login уже запущен обработчиком (см. onSessionExpired) к моменту, когда этот throw
// долетит до компонента.
export class SessionExpiredError extends Error {
  constructor(cause?: unknown) {
    super("Session expired", cause === undefined ? undefined : { cause });
    this.name = "SessionExpiredError";
  }
}

type Handler = () => void;
let handler: Handler | null = null;

// Регистрируется ровно один раз в app-бутстрапе (main.tsx). shared/api не знает про Router/Query
// (NET-2 — shared знает только HTTP+JSON) — наружу торчит только факт «сессия инвалидна».
export function onSessionExpired(fn: Handler): void {
  handler = fn;
}

export function notifySessionExpired(): void {
  handler?.();
}
