import { createHash, randomBytes } from "node:crypto";

/** Тот же приём, что refresh-token.ts: 32 случайных байта — угадать невозможно. */
const TOKEN_BYTES = 32;

/** Сырой токен уходит ТОЛЬКО в письмо; в БД остаётся только его хеш. */
export function generateResetToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/** SHA-256, не argon2 — токен высокоэнтропийный, брутфорс нерелевантен (см. refresh-token.ts). */
export function hashResetToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}
