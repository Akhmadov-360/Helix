// shared знает только HTTP+JSON (§6.4): kind типизирован по статусу, но code/details из конверта —
// непрозрачны здесь. Их читает feature, знающая язык домена (WORKSPACE_VERSION_CONFLICT и т.п.).
// Транспорт переносит, не интерпретирует.
export type TransportErrorKind =
  | "network" // запрос не дошёл (fetch бросил) — ответа нет
  | "validation" // 400
  | "unauthorized" // 401
  | "forbidden" // 403
  | "notFound" // 404
  | "conflict" // 409
  | "gone" // 410
  | "unexpected"; // 5xx / немаппленый статус / тело не по контракту

export class TransportError extends Error {
  readonly kind: TransportErrorKind;
  readonly status: number | null;
  readonly code: string | null;
  readonly details: unknown;

  constructor(args: {
    kind: TransportErrorKind;
    message: string;
    status?: number | null;
    code?: string | null;
    details?: unknown;
    cause?: unknown;
  }) {
    super(args.message, args.cause === undefined ? undefined : { cause: args.cause });
    this.name = "TransportError";
    this.kind = args.kind;
    this.status = args.status ?? null;
    this.code = args.code ?? null;
    this.details = args.details;
  }
}

export function transportKindForStatus(status: number): TransportErrorKind {
  switch (status) {
    case 400:
      return "validation";
    case 401:
      return "unauthorized";
    case 403:
      return "forbidden";
    case 404:
      return "notFound";
    case 409:
      return "conflict";
    case 410:
      return "gone";
    default:
      return "unexpected";
  }
}
