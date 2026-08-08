import { createHash, randomBytes } from "node:crypto";

// invites.md §2: тот же приём, что password-reset-token.ts — 32 случайных байта, угадать
// невозможно, SHA-256 хеш в БД (высокоэнтропийный секрет, argon2 не нужен).
const INVITE_TOKEN_BYTES = 32;

// invites.md §2: длиннее RESET_TOKEN_TTL_MS (1 час) — инвайт не даёт доступа к живому аккаунту,
// только приглашение вступить; B2B-приглашения типично отлёживаются в почте днями.
export const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Сырой токен уходит ТОЛЬКО в письмо; в БД остаётся только его хеш. */
export function generateInviteToken(): string {
  return randomBytes(INVITE_TOKEN_BYTES).toString("base64url");
}

export function hashInviteToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}
