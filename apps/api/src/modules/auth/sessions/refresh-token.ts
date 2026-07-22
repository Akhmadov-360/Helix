import { createHash, randomBytes } from "node:crypto";

/** 32 случайных байта — пространство 2^256, угадать невозможно. */
const TOKEN_BYTES = 32;

/**
 * Сырой refresh-токен. Существует ровно в двух местах: в httpOnly-cookie у клиента
 * и мгновение в памяти сервера при выдаче. В БД его нет — там только хеш.
 */
export function generateRefreshToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/**
 * SHA-256, а НЕ argon2 (§3 спеки) — и это не экономия, а корректность.
 *
 * Refresh-токен ВЫСОКОэнтропийный (32 случайных байта), поэтому перебор по нему
 * бессмысленен независимо от скорости хеша. Медленный memory-hard хеш дал бы только
 * латентность на каждом refresh, ничего не улучшив. Контраст с паролем: тот придуман
 * человеком, низкоэнтропийный и брутфорсится — там argon2 обязателен.
 *
 * Смысл хеширования здесь тот же, что у пароля: утечка таблицы не даёт рабочих токенов.
 */
export function hashRefreshToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}
