import { Injectable } from "@nestjs/common";
import { hash, verify } from "@node-rs/argon2";

/**
 * `Algorithm.Argon2id` из библиотеки — `declare const enum`, а он недоступен при
 * `isolatedModules`. Дублируем значение явно: алгоритм — security-параметр, и
 * полагаться на дефолт библиотеки (который может смениться в мажоре) не хочется.
 * Страхует тест: он проверяет, что реальный хеш начинается с `$argon2id$`.
 */
const ALGORITHM_ARGON2ID = 2;

/**
 * Параметры argon2id по OWASP Password Storage Cheat Sheet (минимум для argon2id):
 * 19 MiB памяти, 2 итерации, параллелизм 1.
 *
 * Почему argon2, а не sha256: пароль низкоэнтропийный (его придумал человек), поэтому
 * нужен memory-hard медленный хеш — чтобы перебор был дорогим. Контраст с refresh-токеном,
 * который высокоэнтропийный и хешируется быстрым SHA-256 (docs/specs/auth.md §2, §3).
 */
export const ARGON2_POLICY = {
  algorithm: ALGORITHM_ARGON2ID,
  memoryCost: 19_456, // KiB = 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

/** `$argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>` — параметры лежат внутри самой строки. */
const PHC_PATTERN = /^\$argon2(id|i|d)\$v=(\d+)\$m=(\d+),t=(\d+),p=(\d+)\$/;

const ARGON2_VERSION = 19;

@Injectable()
export class PasswordService {
  /**
   * `passwordHash` самодостаточен: соль и параметры (m, t, p) лежат внутри строки,
   * отдельно хранить их не нужно.
   */
  async hash(plain: string): Promise<string> {
    return hash(plain, ARGON2_POLICY);
  }

  /**
   * Битую/чужого формата строку считаем непрошедшей проверку, а не падаем 500:
   * иначе мусор в поле превращался бы в отказ обслуживания вместо отказа в доступе.
   */
  async verify(passwordHash: string, plain: string): Promise<boolean> {
    try {
      return await verify(passwordHash, plain);
    } catch {
      return false;
    }
  }

  /**
   * Progressive rehash (§2 спеки): если хеш посчитан по устаревшим параметрам —
   * пересчитать прозрачно на логине, когда открытый пароль на руках.
   *
   * Пишем сами: @node-rs/argon2 не даёт needsRehash. Плюс в том, что критерий
   * «устарел» виден явно, а не спрятан в чужой реализации.
   */
  needsRehash(passwordHash: string): boolean {
    const match = PHC_PATTERN.exec(passwordHash);
    // Не распознали формат — безопаснее пересчитать, чем оставить неизвестное.
    if (!match) return true;

    const [, variant, version, memoryCost, timeCost, parallelism] = match;
    if (variant !== "id") return true; // argon2i/argon2d — не наш вариант
    if (Number(version) !== ARGON2_VERSION) return true;

    return (
      Number(memoryCost) < ARGON2_POLICY.memoryCost ||
      Number(timeCost) < ARGON2_POLICY.timeCost ||
      Number(parallelism) < ARGON2_POLICY.parallelism
    );
  }
}
